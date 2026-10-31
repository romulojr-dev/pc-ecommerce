// The order status timeline (FR-20; docs/specs/030-place-an-order, Behavior
// 18). Pure: a function of the order's status and fulfillment. The page
// renders every status even though only Pending payment is placed in this
// story; #80 and #81 only change data.

// The OrderStatus enum's values (prisma/schema.prisma), written out so this
// file stays free of the generated client
export type OrderStatusName =
  | "PENDING_PAYMENT"
  | "PAID"
  | "COD_CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "READY_FOR_PICKUP"
  | "DELIVERED"
  | "PICKED_UP"
  | "CANCELLED"
  | "REFUNDED"

export type FulfillmentName = "DELIVERY" | "PICKUP"

export type TimelineStep = {
  status: OrderStatusName
  label: string
  state: "done" | "current" | "upcoming"
}

export type OrderTimeline = {
  steps: TimelineStep[]
  // Cancelled and Refunded are their own branch after the list, never a step
  branch: { status: "CANCELLED" | "REFUNDED"; label: string } | null
}

const LABELS: Record<OrderStatusName, string> = {
  PENDING_PAYMENT: "Pending payment",
  PAID: "Paid",
  COD_CONFIRMED: "Paid",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  READY_FOR_PICKUP: "Ready for pickup",
  DELIVERED: "Delivered",
  PICKED_UP: "Picked up",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
}

export const statusLabel = (status: OrderStatusName): string => LABELS[status]

const SEQUENCE: Record<FulfillmentName, OrderStatusName[]> = {
  DELIVERY: ["PENDING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "DELIVERED"],
  PICKUP: [
    "PENDING_PAYMENT",
    "PAID",
    "PROCESSING",
    "READY_FOR_PICKUP",
    "PICKED_UP",
  ],
}

// "COD confirmed" shares Paid's place until Sprint 7 (FR-25) gives it its own
const POSITION_ALIAS: Partial<Record<OrderStatusName, OrderStatusName>> = {
  COD_CONFIRMED: "PAID",
}

export function orderTimeline(order: {
  status: OrderStatusName
  fulfillment: FulfillmentName
}): OrderTimeline {
  const sequence = SEQUENCE[order.fulfillment]
  const make = (current: number): TimelineStep[] =>
    sequence.map((status, index) => ({
      status,
      label: LABELS[status],
      state:
        index < current ? "done" : index === current ? "current" : "upcoming",
    }))

  // The prior status isn't stored, so the list stops where the order must
  // have been: a cancelled order never got past payment, and a refund follows
  // a payment. The branch is the current item.
  if (order.status === "CANCELLED") {
    return {
      steps: make(-1).map((step, i) => ({
        ...step,
        state: i === 0 ? "done" : "upcoming",
      })),
      branch: { status: "CANCELLED", label: LABELS.CANCELLED },
    }
  }
  if (order.status === "REFUNDED") {
    return {
      steps: make(2).map((step, i) => ({
        ...step,
        state: i < 2 ? "done" : "upcoming",
      })),
      branch: { status: "REFUNDED", label: LABELS.REFUNDED },
    }
  }

  const status = POSITION_ALIAS[order.status] ?? order.status
  return { steps: make(sequence.indexOf(status)), branch: null }
}
