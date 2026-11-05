import { dateTimeText } from "./time"

// The order status timeline (FR-20; docs/specs/030-place-an-order, Behavior
// 18; docs/specs/038-cash-on-delivery, Behavior 24). Pure: a function of the
// order's status, fulfillment and payment option. The page renders every
// status even when nothing places it yet.

// The OrderStatus enum's values (prisma/schema.prisma), written out so this
// file stays free of the generated client
export type OrderStatusName =
  | "PENDING_PAYMENT"
  | "PENDING_CONFIRMATION"
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

// The PaymentOption enum's values: how the shopper pays
export type PaymentOptionName = "ONLINE" | "COD"

export type TimelineStep = {
  status: OrderStatusName
  label: string
  state: "done" | "current" | "upcoming"
  // A line under the label: when a cash order was confirmed, or when a
  // fulfillment step happened (docs/specs/043-order-fulfillment-transitions)
  detail?: string
  // Further lines: the courier and tracking number on the Shipped step
  lines?: string[]
}

export type OrderTimeline = {
  steps: TimelineStep[]
  // Cancelled and Refunded are their own branch after the list, never a step
  branch: { status: "CANCELLED" | "REFUNDED"; label: string } | null
}

const LABELS: Record<OrderStatusName, string> = {
  PENDING_PAYMENT: "Pending payment",
  PENDING_CONFIRMATION: "Pending confirmation",
  PAID: "Paid",
  COD_CONFIRMED: "COD confirmed",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  READY_FOR_PICKUP: "Ready for pickup",
  DELIVERED: "Delivered",
  PICKED_UP: "Picked up",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
}

export const statusLabel = (status: OrderStatusName): string => LABELS[status]

const SEQUENCE: Record<
  PaymentOptionName,
  Record<FulfillmentName, OrderStatusName[]>
> = {
  ONLINE: {
    DELIVERY: ["PENDING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "DELIVERED"],
    PICKUP: [
      "PENDING_PAYMENT",
      "PAID",
      "PROCESSING",
      "READY_FOR_PICKUP",
      "PICKED_UP",
    ],
  },
  COD: {
    DELIVERY: [
      "PENDING_CONFIRMATION",
      "COD_CONFIRMED",
      "PROCESSING",
      "SHIPPED",
      "DELIVERED",
    ],
    PICKUP: [
      "PENDING_CONFIRMATION",
      "COD_CONFIRMED",
      "PROCESSING",
      "READY_FOR_PICKUP",
      "PICKED_UP",
    ],
  },
}

const AT: Partial<
  Record<
    OrderStatusName,
    [
      prefix: string,
      field: "processingAt" | "shippedAt" | "readyAt" | "completedAt",
    ]
  >
> = {
  PROCESSING: ["Started", "processingAt"],
  SHIPPED: ["Shipped", "shippedAt"],
  READY_FOR_PICKUP: ["Ready", "readyAt"],
  DELIVERED: ["Delivered", "completedAt"],
  PICKED_UP: ["Picked up", "completedAt"],
}

// The time of a fulfillment step, and the parcel on the Shipped step. A step
// with nothing stored (an order that got there before these columns existed)
// shows nothing and is not an error.
function addFulfillment(
  step: TimelineStep,
  order: {
    processingAt?: Date | null
    shippedAt?: Date | null
    readyAt?: Date | null
    completedAt?: Date | null
    courier?: string | null
    trackingNumber?: string | null
  }
) {
  const at = AT[step.status]
  const time = at ? order[at[1]] : null
  if (at && time) step.detail = `${at[0]} ${dateTimeText(time)}`
  if (step.status === "SHIPPED") {
    const lines = [
      order.courier ? `Courier: ${order.courier}` : null,
      order.trackingNumber ? `Tracking number: ${order.trackingNumber}` : null,
    ].filter((line): line is string => line !== null)
    if (lines.length > 0) step.lines = lines
  }
}

export function orderTimeline(order: {
  status: OrderStatusName
  fulfillment: FulfillmentName
  // Online when not given
  paymentOption?: PaymentOptionName
  // When a cash order was confirmed (docs/specs/038-cash-on-delivery, D12)
  confirmedAt?: Date | null
  // The fulfillment moves (docs/specs/043-order-fulfillment-transitions, B20);
  // completedAt is Delivered or Picked up, labeled from the status
  processingAt?: Date | null
  shippedAt?: Date | null
  readyAt?: Date | null
  completedAt?: Date | null
  courier?: string | null
  trackingNumber?: string | null
}): OrderTimeline {
  const sequence = SEQUENCE[order.paymentOption ?? "ONLINE"][order.fulfillment]
  const make = (current: number): TimelineStep[] =>
    sequence.map((status, index) => {
      const step: TimelineStep = {
        status,
        label: LABELS[status],
        state:
          index < current ? "done" : index === current ? "current" : "upcoming",
      }
      // Only the COD confirmed step carries a time, once it has been reached
      if (
        status === "COD_CONFIRMED" &&
        order.confirmedAt &&
        step.state !== "upcoming"
      ) {
        step.detail = `Confirmed ${dateTimeText(order.confirmedAt)}`
      }
      if (step.state !== "upcoming") addFulfillment(step, order)
      return step
    })

  // The prior status isn't stored, so the list stops where the order must
  // have been: a cancelled order never got past payment (or confirmation), and
  // a refund follows a payment. The branch is the current item.
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

  return { steps: make(sequence.indexOf(order.status)), branch: null }
}
