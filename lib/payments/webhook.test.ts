import { describe, expect, it } from "vitest"

import { MAX_WEBHOOK_BYTES, parseWebhook, webhookStatus } from "./webhook"

// docs/specs/032-payment-webhooks: B1–B5 and the answer table (behavior 18).
// B6 (the size limit) is the handler's, in events.test.ts.

const SESSION = "ps-0123456789abcdef01234567"
const body = (value: unknown) => JSON.stringify(value)

describe("parseWebhook", () => {
  it("reads a completed session event (B1)", () => {
    const payload = {
      event: "payment_session.completed",
      data: { payment_session_id: SESSION },
    }
    expect(parseWebhook(body(payload))).toEqual({
      kind: "event",
      type: "completed",
      eventName: "payment_session.completed",
      sessionId: SESSION,
      eventId: `payment_session.completed:${SESSION}`,
      payload,
    })
  })

  it("reads an expired session event (B2)", () => {
    expect(
      parseWebhook(
        body({
          event: "payment_session.expired",
          data: { payment_session_id: SESSION },
        })
      )
    ).toMatchObject({
      type: "expired",
      eventId: `payment_session.expired:${SESSION}`,
    })
  })

  it("ignores another event type (B3)", () => {
    expect(parseWebhook(body({ event: "payment.capture", data: {} }))).toEqual({
      kind: "ignored-type",
      eventName: "payment.capture",
    })
  })

  it.each(["not json", "[]", "null", body({ data: {} }), body({ event: 1 })])(
    "calls %s malformed (B4)",
    (text) => {
      expect(parseWebhook(text)).toEqual({ kind: "malformed" })
    }
  )

  it.each([
    ["a short id", { payment_session_id: "abc" }],
    ["no id", {}],
    ["a number", { payment_session_id: 12 }],
    ["upper-case hex", { payment_session_id: SESSION.toUpperCase() }],
    ["no data", undefined],
  ])("ignores %s as an unknown session (B5)", (_, data) => {
    expect(
      parseWebhook(body({ event: "payment_session.completed", data }))
    ).toEqual({
      kind: "ignored-unknown",
      eventName: "payment_session.completed",
    })
  })

  it("allows 64 KB", () => {
    expect(MAX_WEBHOOK_BYTES).toBe(65_536)
  })
})

describe("webhookStatus", () => {
  it.each([
    ["paid", 200],
    ["mismatch", 200],
    ["late", 200],
    ["second", 200],
    ["expired", 200],
    ["duplicate", 200],
    ["already-applied", 200],
    ["unconfirmed", 200],
    ["ignored-unknown", 200],
    ["ignored-environment", 200],
    ["ignored-type", 200],
    ["unauthorized", 401],
    ["malformed", 400],
    ["too-large", 413],
    ["active", 503],
    ["not-yet", 503],
    ["retry", 503],
    ["error", 500],
  ] as const)("%s → %i", (outcome, status) => {
    expect(webhookStatus(outcome)).toBe(status)
  })
})
