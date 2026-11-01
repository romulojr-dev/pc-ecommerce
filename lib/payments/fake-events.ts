import { toProviderAmount } from "./amount"
import type { FakeSession } from "./fake"

// The fake gateway's webhook bodies, in Xendit's Payment Session shape
// (docs/specs/031-pay-with-xendit, F2; Xendit's session webhook: `event`,
// `business_id`, `created`, and the session as `data`). Amounts are pesos, as
// Xendit sends them. Pure.

export type FakeEventType =
  "payment_session.completed" | "payment_session.expired"

const STATUS: Record<FakeEventType, string> = {
  "payment_session.completed": "COMPLETED",
  "payment_session.expired": "EXPIRED",
}

export function fakeSessionEvent(
  type: FakeEventType,
  session: FakeSession,
  now: Date
) {
  return {
    event: type,
    business_id: "fake-business",
    created: now.toISOString(),
    data: {
      payment_session_id: session.id,
      reference_id: session.referenceId,
      session_type: "PAY",
      mode: "PAYMENT_LINK",
      status: STATUS[type],
      amount:
        session.amountCentavos === null
          ? null
          : toProviderAmount(session.amountCentavos),
      currency: session.currency,
      country: "PH",
      payment_id: session.paymentId,
      expires_at: session.expiresAt.toISOString(),
    },
  }
}
