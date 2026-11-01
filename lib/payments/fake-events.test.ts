import { describe, expect, it } from "vitest"

import { fakeSessionEvent } from "./fake-events"

// docs/specs/031-pay-with-xendit: F2, the event in Xendit's session shape

const session = {
  id: "ps-661f87c614802d6c402cd82d",
  status: "completed" as const,
  amountCentavos: 2_311_000,
  currency: "PHP",
  metadata: {},
  paymentId: "py-0123456789abcdef01234567",
  referenceId: "PCS-7KQ2M9XD-1",
  expiresAt: new Date("2026-11-02T07:00:00Z"),
}

describe("fakeSessionEvent", () => {
  it("builds payment_session.completed with the amount in pesos", () => {
    const now = new Date("2026-11-01T07:05:00Z")
    expect(fakeSessionEvent("payment_session.completed", session, now)).toEqual(
      {
        event: "payment_session.completed",
        business_id: "fake-business",
        created: "2026-11-01T07:05:00.000Z",
        data: {
          payment_session_id: "ps-661f87c614802d6c402cd82d",
          reference_id: "PCS-7KQ2M9XD-1",
          session_type: "PAY",
          mode: "PAYMENT_LINK",
          status: "COMPLETED",
          amount: 23110,
          currency: "PHP",
          country: "PH",
          payment_id: "py-0123456789abcdef01234567",
          expires_at: "2026-11-02T07:00:00.000Z",
        },
      }
    )
  })

  it("builds payment_session.expired", () => {
    const event = fakeSessionEvent(
      "payment_session.expired",
      { ...session, status: "expired", paymentId: null },
      new Date()
    )
    expect(event.data).toMatchObject({ status: "EXPIRED", payment_id: null })
  })
})
