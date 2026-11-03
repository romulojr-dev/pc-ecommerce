import { describe, expect, it, vi } from "vitest"

import { RESEND_API, resendTransport } from "./resend"

// The Resend adapter against a stubbed fetch: the request it makes and how it
// maps answers to codes (docs/specs/035-email-foundation-signed-links, §4
// Outbox). No network.

const message = {
  from: "PC Silicon <orders@mail.pcsilicon.tech>",
  to: "ana@example.com",
  subject: "Your order",
  html: "<p>Hi</p>",
  text: "Hi",
  idempotencyKey: "order-1:ORDER_PLACED",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

const transportWith = (fetch: typeof globalThis.fetch) =>
  resendTransport({ apiKey: "re_secret_key", fetch })

describe("resendTransport", () => {
  it("posts the email with the key and the idempotency key", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ id: "msg_1" }))
    const result = await transportWith(fetch).send(message)

    expect(result).toEqual({ ok: true, id: "msg_1" })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${RESEND_API}/emails`)
    expect(init.method).toBe("POST")
    expect(init.headers).toMatchObject({
      Authorization: "Bearer re_secret_key",
      "Idempotency-Key": "order-1:ORDER_PLACED",
    })
    expect(JSON.parse(init.body)).toEqual({
      from: message.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    })
  })

  it("maps an error to the status and Resend's error name", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        json(
          { name: "validation_error", message: "ana@example.com is bad" },
          422
        )
      )
    expect(await transportWith(fetch).send(message)).toEqual({
      ok: false,
      code: "http-422:validation_error",
    })
  })

  it("never puts a message or body in the code", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json({ name: "Not A Code!", message: "secret" }, 500))
    const result = await transportWith(fetch).send(message)
    expect(result).toEqual({ ok: false, code: "http-500" })
  })

  it("maps a 429 and an unreadable 5xx", async () => {
    const limited = vi
      .fn()
      .mockResolvedValue(json({ name: "rate_limit_exceeded" }, 429))
    expect(await transportWith(limited).send(message)).toEqual({
      ok: false,
      code: "http-429:rate_limit_exceeded",
    })
    const down = vi
      .fn()
      .mockResolvedValue(new Response("<html>", { status: 502 }))
    expect(await transportWith(down).send(message)).toEqual({
      ok: false,
      code: "http-502",
    })
  })

  it("maps a success without an id", async () => {
    const fetch = vi.fn().mockResolvedValue(json({}))
    expect(await transportWith(fetch).send(message)).toEqual({
      ok: false,
      code: "invalid-response",
    })
  })

  it("maps a timeout and a network error", async () => {
    const timeout = vi
      .fn()
      .mockRejectedValue(new DOMException("timed out", "TimeoutError"))
    expect(await transportWith(timeout).send(message)).toEqual({
      ok: false,
      code: "timeout",
    })
    const offline = vi.fn().mockRejectedValue(new TypeError("fetch failed"))
    expect(await transportWith(offline).send(message)).toEqual({
      ok: false,
      code: "network",
    })
  })
})
