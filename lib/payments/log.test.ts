import { afterEach, describe, expect, it, vi } from "vitest"

import { logPaymentEvent } from "./log"

// docs/specs/032-payment-webhooks, rule Logging: one JSON line with only the
// known fields. The handler's cases (L1–L9) are in events.test.ts.

afterEach(() => vi.restoreAllMocks())

describe("logPaymentEvent", () => {
  it("writes one JSON line with only the fields given", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    logPaymentEvent({
      event: "payment.webhook",
      outcome: "ignored-unknown",
      type: "payment_session.completed",
      sessionId: "ps-ffffffffffffffffffffffff",
    })
    expect(info).toHaveBeenCalledTimes(1)
    expect(JSON.parse(info.mock.calls[0][0] as string)).toEqual({
      event: "payment.webhook",
      outcome: "ignored-unknown",
      type: "payment_session.completed",
      sessionId: "ps-ffffffffffffffffffffffff",
    })
  })

  it.each(["retry", "error"])("logs %s as an error", (outcome) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    logPaymentEvent({ event: "payment.reconcile", outcome, code: "timeout" })
    expect(error).toHaveBeenCalledTimes(1)
    expect(info).not.toHaveBeenCalled()
  })

  it("never writes a field it wasn't given", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    const extra = {
      event: "payment.webhook",
      outcome: "paid",
      body: "secret body",
      token: "secret token",
    } as unknown as Parameters<typeof logPaymentEvent>[0]
    logPaymentEvent(extra)
    expect(info.mock.calls[0][0]).not.toMatch(/secret/)
  })
})
