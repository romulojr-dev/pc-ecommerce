import { isPastDue } from "./time"
import type { OrderStatusName, PaymentOptionName } from "./timeline"
import type { LinkVerdict } from "./signed-link"

// What the cod-confirm page shows and what its action may do (docs/specs/038-
// cash-on-delivery, Behavior 17, 18). Pure: the caller verified the link (the
// verdict) and read the order (or found none). The row is the authority: the
// link only proves the shopper holds the emailed link.
//
//   confirm    Pending confirmation, link live, before the deadline: the
//              button
//   confirmed  COD confirmed or any later status: "already confirmed"
//   cancelled  Cancelled, or Pending confirmation at or after its deadline
//              (or the link expired): "not confirmed in time"
//   not-found  a bad signature or purpose, an unknown order, an order that is
//              not a cash order: the same 404 as any wrong credential

export type ConfirmView = "confirm" | "confirmed" | "cancelled" | "not-found"

const CONFIRMED: readonly OrderStatusName[] = [
  "COD_CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "READY_FOR_PICKUP",
  "DELIVERED",
  "PICKED_UP",
  "REFUNDED",
]

export function confirmView(
  verdict: LinkVerdict,
  order: {
    status: OrderStatusName
    expiresAt: Date
    paymentOption: PaymentOptionName
  } | null,
  now: Date
): ConfirmView {
  if (verdict === "invalid" || !order || order.paymentOption !== "COD") {
    return "not-found"
  }
  if (CONFIRMED.includes(order.status)) return "confirmed"
  if (order.status === "CANCELLED") return "cancelled"
  // Online statuses can't belong to a cash order (a CHECK); treat one as no
  // order rather than guess
  if (order.status !== "PENDING_CONFIRMATION") return "not-found"
  return verdict === "expired" || isPastDue(order.expiresAt, now)
    ? "cancelled"
    : "confirm"
}
