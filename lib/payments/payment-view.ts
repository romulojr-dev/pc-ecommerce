import { isPastDue } from "@/lib/orders/time"
import type { OrderStatusName } from "@/lib/orders/timeline"

import { canStartSession } from "./payable"
import type { PaymentParam } from "./session-request"

// What the order page's payment area shows (docs/specs/031-pay-with-xendit,
// Behavior 4–12, V1–V9). The `payment=` value only chooses the view; it never
// changes data, and it is ignored once the order isn't Pending payment. Pure.

export type PaymentView =
  // Not Pending payment: no payment area (spec 030's status views)
  | "none"
  // Pay now
  | "pay"
  // Back from the gateway's success URL: wait for the webhook (#80)
  | "confirming"
  // Back from the gateway's cancel URL: Retry payment
  | "cancelled"
  // The session couldn't open: the message, then Pay now
  | "error"
  // Under 10 minutes left: no session can open
  | "too-late"
  // Past expiresAt: shown as cancelled whatever the row says, with no way to
  // pay (docs/specs/033-release-unpaid-orders, behavior 31)
  | "expired"
  // A payment's amount didn't match: no payment can start, only the message
  // (docs/specs/032-payment-webhooks, behavior 24)
  | "needs-check"

const PARAMS: readonly PaymentParam[] = ["return", "cancelled", "error"]

// The `payment=` value from the URL; anything else is no value (V9)
export function parsePaymentParam(value: unknown): PaymentParam | null {
  return typeof value === "string" &&
    (PARAMS as readonly string[]).includes(value)
    ? (value as PaymentParam)
    : null
}

// The order's payments, as far as the view cares (docs/specs/032-payment-
// webhooks, behavior 21 and 24)
export type PaymentsSummary = {
  // The newest Payment's status
  latest: "pending" | "expired" | "paid" | "failed" | null
  // A payment whose amount didn't match (Payment.problem AMOUNT_MISMATCH)
  needsCheck: boolean
}

const NO_PAYMENTS: PaymentsSummary = { latest: null, needsCheck: false }

const LATEST = {
  PENDING: "pending",
  EXPIRED: "expired",
  PAID: "paid",
  FAILED: "failed",
} as const

// The summary from an order's payments, newest first. "Latest" is the newest
// payment that got a session: an attempt still opening or one that failed
// without a session never changes the view (docs/specs/034-start-payment-
// outside-transaction, behavior 9, D9). A mismatch counts on any payment.
export function paymentsSummary(
  payments: readonly {
    status: "OPENING" | keyof typeof LATEST
    providerRef: string | null
    problem: string | null
  }[]
): PaymentsSummary {
  const latest = payments.find(
    ({ status, providerRef }) => status !== "OPENING" && providerRef !== null
  )
  return {
    latest:
      latest && latest.status !== "OPENING" ? LATEST[latest.status] : null,
    needsCheck: payments.some(({ problem }) => problem === "AMOUNT_MISMATCH"),
  }
}

export function paymentView(
  status: OrderStatusName,
  expiresAt: Date,
  param: PaymentParam | null,
  now: Date,
  payments: PaymentsSummary = NO_PAYMENTS
): PaymentView {
  // A payment that needs checking wins over everything, and also shows on a
  // cancelled order (V16–V16d)
  if (
    payments.needsCheck &&
    (status === "PENDING_PAYMENT" || status === "CANCELLED")
  ) {
    return "needs-check"
  }
  if (status !== "PENDING_PAYMENT") return "none"
  if (isPastDue(expiresAt, now)) return "expired"
  // A return from a payment waits whatever time is left: the shopper may
  // have paid (V2)
  if (param === "return") return "confirming"
  if (!canStartSession(expiresAt, now)) return "too-late"
  if (param === "cancelled") return "cancelled"
  if (param === "error") return "error"
  // The last session expired unpaid: Retry, as after a cancel (V14, D12)
  if (payments.latest === "expired") return "cancelled"
  return "pay"
}
