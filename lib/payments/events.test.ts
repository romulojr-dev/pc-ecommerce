import { afterEach, describe, expect, it, vi } from "vitest"

import { callbackTokenMatches, deliverPaymentEvent } from "./events"

// The event seam's token check (docs/specs/031-pay-with-xendit, §6; the cases
// #80's webhook route inherits)

afterEach(() => vi.restoreAllMocks())

const TOKEN = "webhook-token-123"
const body = JSON.stringify({
  event: "payment_session.completed",
  data: { payment_session_id: "ps-661f87c614802d6c402cd82d" },
})

describe("callbackTokenMatches", () => {
  it.each([
    [TOKEN, TOKEN, true],
    ["wrong-token", TOKEN, false],
    ["webhook-token-12", TOKEN, false],
    [`${TOKEN}x`, TOKEN, false],
    ["", TOKEN, false],
    [null, TOKEN, false],
    [TOKEN, undefined, false],
    [TOKEN, "", false],
  ])("%j against %j → %s", (given, expected, matches) => {
    expect(callbackTokenMatches(given, expected)).toBe(matches)
  })
})

describe("deliverPaymentEvent", () => {
  it("accepts the right token in any header case, logging only the type and session", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    expect(
      deliverPaymentEvent(
        { headers: { "X-Callback-Token": TOKEN }, body },
        TOKEN
      )
    ).toEqual({ ok: true })
    expect(info).toHaveBeenCalledWith(
      "payment.event_delivered: payment_session.completed ps-661f87c614802d6c402cd82d"
    )
    expect(JSON.stringify(info.mock.calls)).not.toContain(TOKEN)
  })

  it.each([
    ["a wrong token", { "x-callback-token": "nope" }],
    ["no token", {}],
  ])("refuses %s with 401 and logs nothing", (_, headers) => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    expect(deliverPaymentEvent({ headers, body }, TOKEN)).toEqual({
      ok: false,
      status: 401,
    })
    expect(info).not.toHaveBeenCalled()
  })

  it("refuses everything when no token is configured", () => {
    expect(
      deliverPaymentEvent(
        { headers: { "x-callback-token": "" }, body },
        undefined
      )
    ).toEqual({ ok: false, status: 401 })
  })

  it("refuses a body that isn't JSON", () => {
    expect(
      deliverPaymentEvent(
        { headers: { "x-callback-token": TOKEN }, body: "{" },
        TOKEN
      )
    ).toEqual({ ok: false, status: 400 })
  })
})
