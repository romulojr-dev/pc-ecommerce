import { afterEach, describe, expect, it, vi } from "vitest"

import {
  callbackTokenMatches,
  type DeliveryOptions,
  handlePaymentEvent,
} from "./events"
import type { ReconcileResult } from "./reconcile"

// The webhook handler without a database (docs/specs/032-payment-webhooks):
// K1–K7, B6, L1–L9. reconcileSession is replaced; its own cases are in
// reconcile.db.test.ts.

vi.mock("./reconcile", () => ({ reconcileSession: vi.fn() }))

afterEach(() => vi.restoreAllMocks())

const TOKEN = "webhook-token-123"
const SESSION = "ps-0123456789abcdef01234567"
const body = JSON.stringify({
  event: "payment_session.completed",
  data: { payment_session_id: SESSION },
})

// Every console method, so nothing can slip out through another one
function spyConsole() {
  return (["log", "info", "warn", "error", "debug"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {})
  )
}
const logged = (spies: ReturnType<typeof spyConsole>) =>
  spies.flatMap((spy) => spy.mock.calls.map((call) => String(call[0])))

const reconciled = (result: ReconcileResult) => {
  const reconcile = vi.fn(async () => result)
  return {
    reconcile: reconcile as unknown as DeliveryOptions["reconcile"],
    calls: reconcile.mock.calls,
  }
}

describe("callbackTokenMatches", () => {
  it.each([
    [TOKEN, TOKEN, true], // K1
    ["webhook-token-124", TOKEN, false], // K2
    [`${TOKEN}x`, TOKEN, false], // K4
    ["", TOKEN, false], // K6
    [null, TOKEN, false], // K3
    [TOKEN, undefined, false], // K6
    [TOKEN, "", false],
  ])("%j against %j → %s", (given, expected, matches) => {
    expect(callbackTokenMatches(given, expected)).toBe(matches)
  })
})

describe("handlePaymentEvent: the token", () => {
  it("accepts the token in any header case (K1, K7)", async () => {
    spyConsole()
    const { reconcile } = reconciled({
      outcome: "paid",
      orderNumber: "PCS-7KQ2M9XD",
    })
    const cases: (Headers | Record<string, string>)[] = [
      { "x-callback-token": TOKEN },
      { "X-Callback-Token": TOKEN },
      new Headers({ "X-Callback-Token": TOKEN }),
    ]
    for (const headers of cases) {
      expect(
        await handlePaymentEvent({ headers, body }, TOKEN, { reconcile })
      ).toEqual({ status: 200, outcome: "paid" })
    }
  })

  it.each([
    ["a wrong token", new Headers({ "x-callback-token": "webhook-token-124" })], // K2
    ["no token", new Headers()], // K3
    ["a longer token", new Headers({ "x-callback-token": `${TOKEN}x` })], // K4
    ["an empty token", new Headers({ "x-callback-token": "" })], // K6
  ])("refuses %s with 401, reading nothing (K2–K6, L1)", async (_, headers) => {
    const spies = spyConsole()
    const { reconcile, calls } = reconciled({ outcome: "paid" })
    expect(
      await handlePaymentEvent({ headers, body }, TOKEN, { reconcile })
    ).toEqual({ status: 401, outcome: "unauthorized" })
    expect(calls).toHaveLength(0)
    expect(logged(spies)).toEqual([
      JSON.stringify({ event: "payment.webhook", outcome: "unauthorized" }),
    ])
  })

  it("refuses a repeated header (K5)", async () => {
    spyConsole()
    const headers = new Headers()
    headers.append("x-callback-token", TOKEN)
    headers.append("x-callback-token", TOKEN)
    expect(await handlePaymentEvent({ headers, body }, TOKEN)).toMatchObject({
      status: 401,
    })
  })

  it("refuses everything when no token is configured (K6)", async () => {
    spyConsole()
    expect(
      await handlePaymentEvent(
        { headers: { "x-callback-token": "" }, body },
        undefined
      )
    ).toMatchObject({ status: 401 })
  })
})

describe("handlePaymentEvent: the body", () => {
  const headers = { "x-callback-token": TOKEN }

  it("refuses a body over 64 KB before reading it (B6)", async () => {
    spyConsole()
    const { reconcile, calls } = reconciled({ outcome: "paid" })
    expect(
      await handlePaymentEvent({ headers, body: "x".repeat(65_537) }, TOKEN, {
        reconcile,
      })
    ).toEqual({ status: 413, outcome: "too-large" })
    expect(calls).toHaveLength(0)
  })

  it("answers 400 for a body that isn't JSON (B4)", async () => {
    spyConsole()
    expect(await handlePaymentEvent({ headers, body: "{" }, TOKEN)).toEqual({
      status: 400,
      outcome: "malformed",
    })
  })

  it("answers 200 for another event type, logging it (B3, L2)", async () => {
    const spies = spyConsole()
    expect(
      await handlePaymentEvent(
        { headers, body: JSON.stringify({ event: "payment.capture" }) },
        TOKEN
      )
    ).toEqual({ status: 200, outcome: "ignored-type" })
    expect(logged(spies)).toEqual([
      JSON.stringify({
        event: "payment.webhook",
        outcome: "ignored-type",
        type: "payment.capture",
      }),
    ])
  })

  it("answers 200 for a malformed session id, without logging it (B5, L9)", async () => {
    const spies = spyConsole()
    const bad = JSON.stringify({
      event: "payment_session.completed",
      data: { payment_session_id: "../../etc" },
    })
    expect(await handlePaymentEvent({ headers, body: bad }, TOKEN)).toEqual({
      status: 200,
      outcome: "ignored-unknown",
    })
    expect(logged(spies).join()).not.toContain("etc")
  })
})

describe("handlePaymentEvent: reconciling", () => {
  const headers = { "x-callback-token": TOKEN }

  it("passes the event to reconcileSession and answers its outcome", async () => {
    spyConsole()
    const { reconcile, calls } = reconciled({ outcome: "paid" })
    await handlePaymentEvent({ headers, body }, TOKEN, { reconcile })
    expect(calls).toEqual([
      [
        SESSION,
        {
          event: {
            eventId: `payment_session.completed:${SESSION}`,
            type: "payment_session.completed",
            payload: JSON.parse(body),
          },
        },
      ],
    ])
  })

  it.each([
    [{ outcome: "ignored-unknown" }, 200], // L3
    [{ outcome: "ignored-unknown", code: "unknown-order" }, 200], // L4
    [{ outcome: "ignored-environment", code: "production" }, 200], // L5
    [{ outcome: "active", orderNumber: "PCS-7KQ2M9XD" }, 503], // L6
    [{ outcome: "paid", orderNumber: "PCS-7KQ2M9XD" }, 200], // L7
    [{ outcome: "retry", code: "timeout" }, 503],
    [{ outcome: "error", orderNumber: "PCS-7KQ2M9XD" }, 500],
  ] satisfies [ReconcileResult, number][])(
    "logs one line for %j and answers %i (L3–L7)",
    async (result, status) => {
      const spies = spyConsole()
      const { reconcile } = reconciled(result)
      expect(
        await handlePaymentEvent({ headers, body }, TOKEN, { reconcile })
      ).toEqual({ status, outcome: result.outcome })
      const lines = logged(spies)
      expect(lines).toHaveLength(1)
      expect(JSON.parse(lines[0])).toEqual({
        event: "payment.webhook",
        type: "payment_session.completed",
        sessionId: SESSION,
        ...result,
      })
    }
  )

  it("never logs the token, the body or anything secret (L8)", async () => {
    const spies = spyConsole()
    const secret = JSON.stringify({
      event: "payment_session.completed",
      data: {
        payment_session_id: SESSION,
        success_return_url: "https://x.example/orders/PCS-1?key=SECRETKEY",
        customer: { email: "ana@example.com", mobile: "+639171234567" },
      },
    })
    const { reconcile } = reconciled({ outcome: "paid", orderNumber: "PCS-1" })
    await handlePaymentEvent({ headers, body: secret }, TOKEN, { reconcile })
    await handlePaymentEvent(
      { headers: { "x-callback-token": "wrong" }, body: secret },
      TOKEN,
      { reconcile }
    )
    const all = logged(spies).join("\n")
    for (const text of [
      TOKEN,
      "SECRETKEY",
      "https://",
      "ana@example.com",
      "+639",
      "wrong",
    ]) {
      expect(all).not.toContain(text)
    }
  })
})
