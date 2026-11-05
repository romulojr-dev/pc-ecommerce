import type { OrderStatusName } from "./timeline"

// "Counts as a sale" (docs/specs/042-admin-customers, B5, R4): an order the
// shop has been paid for and not given back. `paidAt` is set (an online order
// from the moment it is Paid; a cash order once Admin records delivery or
// pickup) and the status is neither Cancelled nor Refunded. Customers' "Total
// spent" uses it; the Dashboard will too. `saleOrderCondition` ([sale-sql.ts])
// states the same rule in SQL and the tests check the two against each other.
// Pure: no database.
export const countsAsSale = (order: {
  status: OrderStatusName
  paidAt: Date | null
}): boolean =>
  order.paidAt !== null &&
  order.status !== "CANCELLED" &&
  order.status !== "REFUNDED"
