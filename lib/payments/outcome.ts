import type { OrderStatusName } from "@/lib/orders/timeline"

// What reconciling a payment session ends in (docs/specs/032-payment-
// webhooks, behavior 7–18, rule Logging), and the pure decisions inside it.
// Every webhook and every reconcile logs exactly one of these.

export type ReconcileOutcome =
  // Applied
  | "paid"
  | "mismatch"
  | "late"
  | "second"
  | "expired"
  // Nothing new to apply
  | "duplicate"
  | "already-applied"
  // Permanent: a retry would get the same answer
  | "unconfirmed"
  | "ignored-unknown"
  | "ignored-environment"
  // Try again later
  | "active"
  | "not-yet"
  | "retry"
  | "error"

// What only the webhook route can end in, before it reconciles
export type WebhookOutcome =
  ReconcileOutcome | "unauthorized" | "too-large" | "malformed" | "ignored-type"

export type CompletedOutcome = "paid" | "mismatch" | "late" | "second"

// A completed, succeeded session's effect, by the order's status when it is
// locked (behavior 13). A Pending order past expiresAt still becomes Paid: the
// session couldn't be paid after its own expiry, which is never after the
// order's (D4).
export function completedOutcome(
  orderStatus: OrderStatusName,
  amountsMatch: boolean
): CompletedOutcome {
  if (orderStatus === "PENDING_PAYMENT")
    return amountsMatch ? "paid" : "mismatch"
  if (orderStatus === "CANCELLED" || orderStatus === "REFUNDED") return "late"
  return "second"
}

// An expired session's effect on its Payment (behavior 16): only an open one
// changes
export const expiredOutcome = (
  paymentStatus: "OPENING" | "PENDING" | "PAID" | "FAILED" | "EXPIRED"
): "expired" | "already-applied" =>
  paymentStatus === "PENDING" ? "expired" : "already-applied"

export type ReceivedAmounts = {
  // Centavos, or null when the gateway's amount isn't a valid peso amount
  sessionAmount: number | null
  sessionCurrency: string
  paymentAmount: number | null
  paymentCurrency: string
  // The Payment row's and the order's, in centavos
  rowAmount: number
  orderTotal: number
}

// Whether the money received settles the order (behavior 12): every amount
// equal, both currencies PHP. An unreadable amount is a mismatch.
export function amountsMatch(amounts: ReceivedAmounts): boolean {
  const { sessionAmount, paymentAmount, rowAmount, orderTotal } = amounts
  return (
    sessionAmount !== null &&
    sessionAmount === paymentAmount &&
    sessionAmount === rowAmount &&
    sessionAmount === orderTotal &&
    amounts.sessionCurrency === "PHP" &&
    amounts.paymentCurrency === "PHP"
  )
}
