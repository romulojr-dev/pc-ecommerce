import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionInput } from "./session-request"
import { XENDIT_API, xenditGateway } from "./xendit"

// The Xendit adapter against responses shaped like Xendit's documented ones
// (docs/specs/031-pay-with-xendit, §6 Xendit, as documented; S1). fetch is
// injected, so nothing leaves the machine.

const KEY = "xnd_development_SECRET123"
const TOKEN = "A".repeat(43)
const SESSION_ID = "ps-661f87c614802d6c402cd82d"

const input: SessionInput = {
  referenceId: "PCS-7KQ2M9XD-1",
  amountCentavos: 2_311_000,
  currency: "PHP",
  description: "PC Silicon order PCS-7KQ2M9XD",
  metadata: {
    order_id: "cord1",
    order_number: "PCS-7KQ2M9XD",
    environment: "production",
  },
  successUrl: `https://pcsilicon.example/orders/PCS-7KQ2M9XD?key=${TOKEN}&payment=return`,
  cancelUrl: `https://pcsilicon.example/orders/PCS-7KQ2M9XD?key=${TOKEN}&payment=cancelled`,
  expiresAt: new Date("2026-11-02T07:00:00.000Z"),
}

// From apidocs/create-session and get-session (fields the adapter reads)
const session = (overrides: Record<string, unknown> = {}) => ({
  payment_session_id: SESSION_ID,
  reference_id: "PCS-7KQ2M9XD-1",
  session_type: "PAY",
  mode: "PAYMENT_LINK",
  currency: "PHP",
  amount: 23110,
  country: "PH",
  status: "ACTIVE",
  expires_at: "2026-11-02T07:00:00.000Z",
  payment_link_url: `https://checkout-staging.xendit.co/sessions/${SESSION_ID}`,
  metadata: input.metadata,
  payment_id: null,
  ...overrides,
})

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

// Answers each call in turn and records what was asked
function fakeFetch(...answers: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetcher = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      const answer = answers.shift()
      if (!answer) throw new Error("unexpected call")
      if (answer instanceof Error) throw answer
      return answer
    }
  )
  return { fetcher: fetcher as unknown as typeof fetch, calls }
}

const consoleCalls: unknown[][] = []
afterEach(() => {
  consoleCalls.length = 0
  vi.restoreAllMocks()
})
function spyConsole() {
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args) => {
      consoleCalls.push(args)
    })
  }
}

describe("createSession", () => {
  it("sends Xendit's PAY / PAYMENT_LINK request with Basic auth (S1)", async () => {
    const { fetcher, calls } = fakeFetch(json(201, session()))
    const result = await xenditGateway({
      secretKey: KEY,
      fetch: fetcher,
    }).createSession(input)

    expect(result).toEqual({
      ok: true,
      session: {
        id: SESSION_ID,
        url: `https://checkout-staging.xendit.co/sessions/${SESSION_ID}`,
        status: "active",
        expiresAt: new Date("2026-11-02T07:00:00.000Z"),
      },
    })
    const [{ url, init }] = calls
    expect(url).toBe(`${XENDIT_API}/sessions`)
    expect(init.method).toBe("POST")
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from(`${KEY}:`).toString("base64")}`
    )
    expect(JSON.parse(String(init.body))).toEqual({
      reference_id: "PCS-7KQ2M9XD-1",
      session_type: "PAY",
      mode: "PAYMENT_LINK",
      currency: "PHP",
      country: "PH",
      amount: 23110,
      allowed_payment_channels: ["GCASH", "PAYMAYA", "CARDS"],
      expires_at: "2026-11-02T07:00:00.000Z",
      description: "PC Silicon order PCS-7KQ2M9XD",
      metadata: input.metadata,
      success_return_url: input.successUrl,
      cancel_return_url: input.cancelUrl,
    })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it("sends centavos as a decimal number", async () => {
    const { fetcher, calls } = fakeFetch(json(201, session({ amount: 19.99 })))
    await xenditGateway({ secretKey: KEY, fetch: fetcher }).createSession({
      ...input,
      amountCentavos: 1_999,
    })
    expect(String(calls[0].init.body)).toContain('"amount":19.99,')
  })

  it("reports Xendit's error code, never its message", async () => {
    spyConsole()
    const { fetcher } = fakeFetch(
      json(400, {
        error_code: "INVALID_AMOUNT",
        message: `bad amount for ${input.successUrl}`,
      })
    )
    const result = await xenditGateway({
      secretKey: KEY,
      fetch: fetcher,
    }).createSession(input)
    expect(result).toEqual({ ok: false, code: "http-400:INVALID_AMOUNT" })
    expect(consoleCalls).toEqual([])
  })

  it.each([
    ["a 500 with no body", new Response("oops", { status: 500 }), "http-500"],
    [
      "an odd error code",
      json(400, { error_code: "bad code; key=x" }),
      "http-400",
    ],
    [
      "a timeout",
      Object.assign(new Error("t"), { name: "TimeoutError" }),
      "timeout",
    ],
    ["a network error", new TypeError("fetch failed"), "network"],
    [
      "a 201 without a link",
      json(201, session({ payment_link_url: undefined })),
      "invalid-response",
    ],
    [
      "an unknown status",
      json(201, session({ status: "WEIRD" })),
      "invalid-response",
    ],
  ])("fails safely on %s", async (_, answer, code) => {
    const { fetcher } = fakeFetch(answer)
    expect(
      await xenditGateway({ secretKey: KEY, fetch: fetcher }).createSession(
        input
      )
    ).toEqual({ ok: false, code })
  })
})

describe("closeSession (Behavior 14)", () => {
  it("cancels an active session", async () => {
    const { fetcher, calls } = fakeFetch(
      json(200, session({ status: "CANCELED" }))
    )
    expect(
      await xenditGateway({ secretKey: KEY, fetch: fetcher }).closeSession(
        SESSION_ID
      )
    ).toEqual({ ok: true, outcome: "closed" })
    expect(calls[0].url).toBe(`${XENDIT_API}/sessions/${SESSION_ID}/cancel`)
    expect(calls[0].init.method).toBe("POST")
  })

  const notActive = () =>
    json(422, {
      error_code: "INVALID_SESSION_STATUS",
      message: "Only ACTIVE sessions can be canceled.",
    })

  it.each([
    ["EXPIRED", { ok: true, outcome: "closed" }],
    ["CANCELED", { ok: true, outcome: "closed" }],
    ["COMPLETED", { ok: true, outcome: "completed" }],
    ["ACTIVE", { ok: false, code: "cancel-refused" }],
  ])("reads a session that isn't active: %s", async (status, outcome) => {
    const { fetcher, calls } = fakeFetch(
      notActive(),
      json(200, session({ status }))
    )
    expect(
      await xenditGateway({ secretKey: KEY, fetch: fetcher }).closeSession(
        SESSION_ID
      )
    ).toEqual(outcome)
    expect(calls[1].url).toBe(`${XENDIT_API}/sessions/${SESSION_ID}`)
    expect(calls[1].init.method).toBe("GET")
  })

  it("fails on any other error, without reading", async () => {
    const { fetcher, calls } = fakeFetch(new Response("", { status: 503 }))
    expect(
      await xenditGateway({ secretKey: KEY, fetch: fetcher }).closeSession(
        SESSION_ID
      )
    ).toEqual({ ok: false, code: "http-503" })
    expect(calls).toHaveLength(1)
  })
})

describe("getSession", () => {
  it("maps status, amount, metadata and payment id", async () => {
    const { fetcher } = fakeFetch(
      json(200, session({ status: "COMPLETED", payment_id: "py-123" }))
    )
    expect(
      await xenditGateway({ secretKey: KEY, fetch: fetcher }).getSession(
        SESSION_ID
      )
    ).toEqual({
      ok: true,
      session: {
        id: SESSION_ID,
        status: "completed",
        amountCentavos: 2_311_000,
        currency: "PHP",
        metadata: input.metadata,
        paymentId: "py-123",
        referenceId: "PCS-7KQ2M9XD-1",
        expiresAt: new Date("2026-11-02T07:00:00.000Z"),
      },
    })
  })

  it("is null for an unknown session", async () => {
    const { fetcher } = fakeFetch(json(404, { error_code: "NOT_FOUND" }))
    expect(
      await xenditGateway({ secretKey: KEY, fetch: fetcher }).getSession("ps-x")
    ).toEqual({ ok: true, session: null })
  })
})

describe("getPayment", () => {
  it("reads /v3/payments with the API version", async () => {
    const { fetcher, calls } = fakeFetch(
      json(200, {
        payment_id: "py-123",
        status: "SUCCEEDED",
        request_amount: 23110,
        currency: "PHP",
        channel_code: "GCASH",
      })
    )
    expect(
      await xenditGateway({ secretKey: KEY, fetch: fetcher }).getPayment(
        "py-123"
      )
    ).toEqual({
      ok: true,
      payment: {
        id: "py-123",
        status: "succeeded",
        amountCentavos: 2_311_000,
        currency: "PHP",
        method: "GCASH",
      },
    })
    expect(calls[0].url).toBe(`${XENDIT_API}/v3/payments/py-123`)
    expect(
      (calls[0].init.headers as Record<string, string>)["api-version"]
    ).toBe("2024-11-11")
  })
})

describe("the secret key", () => {
  it("appears only in the Authorization header", async () => {
    spyConsole()
    const { fetcher, calls } = fakeFetch(
      json(500, { error_code: "SERVER_ERROR", message: KEY }),
      json(422, { error_code: "INVALID_SESSION_STATUS" }),
      new Error(KEY)
    )
    const gateway = xenditGateway({ secretKey: KEY, fetch: fetcher })
    const results = [
      await gateway.createSession(input),
      await gateway.closeSession(SESSION_ID),
    ]
    expect(JSON.stringify(results)).not.toContain("SECRET123")
    expect(JSON.stringify(consoleCalls)).not.toContain("SECRET123")
    for (const { url, init } of calls) {
      expect(url).not.toContain("SECRET123")
      expect(String(init.body ?? "")).not.toContain("SECRET123")
    }
  })
})
