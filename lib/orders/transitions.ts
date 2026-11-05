import type {
  FulfillmentName,
  OrderStatusName,
  PaymentOptionName,
} from "./timeline"

// The moves staff can make on an order's fulfillment (docs/specs/043-order-
// fulfillment-transitions, B1, R1, R2). The one statement of the table: the
// admin page (which button), the server action (what to accept) and the tests
// all use it. Cancel is #109 and refunds #110, so neither is a target here.
// Pure: no database.

export type TransitionTarget =
  "PROCESSING" | "SHIPPED" | "READY_FOR_PICKUP" | "DELIVERED" | "PICKED_UP"

export const TRANSITION_TARGETS: readonly TransitionTarget[] = [
  "PROCESSING",
  "SHIPPED",
  "READY_FOR_PICKUP",
  "DELIVERED",
  "PICKED_UP",
]

export type TransitionOrder = {
  status: OrderStatusName
  fulfillment: FulfillmentName
  paymentOption: PaymentOptionName
}

// What each status means to the table, written for every OrderStatus value so
// a new one is a type error until someone decides (R2)
type Rule = (order: TransitionOrder) => TransitionTarget | null

const RULES: Record<OrderStatusName, Rule> = {
  PENDING_PAYMENT: () => null,
  PENDING_CONFIRMATION: () => null,
  // Only an online order is Paid, and only a cash order is COD confirmed; a
  // combination the database forbids has no move
  PAID: (o) => (o.paymentOption === "ONLINE" ? "PROCESSING" : null),
  COD_CONFIRMED: (o) => (o.paymentOption === "COD" ? "PROCESSING" : null),
  PROCESSING: (o) =>
    o.fulfillment === "DELIVERY" ? "SHIPPED" : "READY_FOR_PICKUP",
  SHIPPED: (o) => (o.fulfillment === "DELIVERY" ? "DELIVERED" : null),
  READY_FOR_PICKUP: (o) => (o.fulfillment === "PICKUP" ? "PICKED_UP" : null),
  DELIVERED: () => null,
  PICKED_UP: () => null,
  CANCELLED: () => null,
  REFUNDED: () => null,
}

// The statuses staff may move the order to from where it is: none or one
export function transitionsFor(order: TransitionOrder): TransitionTarget[] {
  const target = RULES[order.status](order)
  return target ? [target] : []
}

export const canTransition = (order: TransitionOrder, to: string): boolean =>
  (transitionsFor(order) as string[]).includes(to)

export type TransitionEmail =
  "ORDER_SHIPPED" | "READY_FOR_PICKUP" | "ORDER_DELIVERED"

// The email a move sends (B15); Processing and Picked up send none
export function emailTypeFor(to: TransitionTarget): TransitionEmail | null {
  switch (to) {
    case "SHIPPED":
      return "ORDER_SHIPPED"
    case "READY_FOR_PICKUP":
      return "READY_FOR_PICKUP"
    case "DELIVERED":
      return "ORDER_DELIVERED"
    default:
      return null
  }
}

// A cash order is recorded as paid when it is handed over (R8)
export const recordsCashPayment = (
  order: Pick<TransitionOrder, "paymentOption">,
  to: TransitionTarget
): boolean =>
  order.paymentOption === "COD" && (to === "DELIVERED" || to === "PICKED_UP")

export type TimestampField =
  "processingAt" | "shippedAt" | "readyAt" | "completedAt"

// The Order column a move stamps (R7)
export const TIMESTAMP_FIELD: Record<TransitionTarget, TimestampField> = {
  PROCESSING: "processingAt",
  SHIPPED: "shippedAt",
  READY_FOR_PICKUP: "readyAt",
  DELIVERED: "completedAt",
  PICKED_UP: "completedAt",
}

export const isTransitionTarget = (value: string): value is TransitionTarget =>
  (TRANSITION_TARGETS as readonly string[]).includes(value)
