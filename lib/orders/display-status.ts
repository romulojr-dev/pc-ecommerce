import { isPastDue } from "./time"
import type { OrderStatusName } from "./timeline"

// The status the order page shows (docs/specs/038-cash-on-delivery, Behavior
// 25): an order still Pending (payment, or confirmation) at or after its
// deadline reads as Cancelled whatever the row says, because the release may
// not have run yet. A COD confirmed order past `expiresAt` stays as it is: it
// never expires. A payment that needs checking (spec 032) is the caller's
// concern. Pure.
export function displayStatus(
  order: { status: OrderStatusName; expiresAt: Date },
  now: Date
): OrderStatusName {
  const pending =
    order.status === "PENDING_PAYMENT" ||
    order.status === "PENDING_CONFIRMATION"
  return pending && isPastDue(order.expiresAt, now) ? "CANCELLED" : order.status
}
