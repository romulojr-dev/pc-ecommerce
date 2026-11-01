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
  // Past expiresAt: spec 030's past-due text
  | "past-due"

const PARAMS: readonly PaymentParam[] = ["return", "cancelled", "error"]

// The `payment=` value from the URL; anything else is no value (V9)
export function parsePaymentParam(value: unknown): PaymentParam | null {
  return typeof value === "string" &&
    (PARAMS as readonly string[]).includes(value)
    ? (value as PaymentParam)
    : null
}

export function paymentView(
  status: OrderStatusName,
  expiresAt: Date,
  param: PaymentParam | null,
  now: Date
): PaymentView {
  if (status !== "PENDING_PAYMENT") return "none"
  if (isPastDue(expiresAt, now)) return "past-due"
  // A return from a payment waits whatever time is left: the shopper may
  // have paid (V2)
  if (param === "return") return "confirming"
  if (!canStartSession(expiresAt, now)) return "too-late"
  if (param === "cancelled") return "cancelled"
  if (param === "error") return "error"
  return "pay"
}
