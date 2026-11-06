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
  // Cancelled carries when, once the order has the time
  branch: {
    status: "CANCELLED" | "REFUNDED"
    label: string
    detail?: string
  } | null
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

// The furthest step of the order's own sequence its timestamps show (B22)
function reachedIndex(
  sequence: OrderStatusName[],
  order: {
    paymentOption?: PaymentOptionName
    confirmedAt?: Date | null
    paidAt?: Date | null
    processingAt?: Date | null
    readyAt?: Date | null
  }
): number {
  const at = (status: OrderStatusName) => sequence.indexOf(status)
  if (order.readyAt && at("READY_FOR_PICKUP") >= 0) {
    return at("READY_FOR_PICKUP")
  }
  if (order.processingAt) return at("PROCESSING")
  if (order.paymentOption === "COD") {
    return order.confirmedAt ? at("COD_CONFIRMED") : 0
  }
  return order.paidAt ? at("PAID") : 0
}

export function orderTimeline(order: {
  status: OrderStatusName
  fulfillment: FulfillmentName
  // Online when not given
  paymentOption?: PaymentOptionName
  // When a cash order was confirmed (docs/specs/038-cash-on-delivery, D12)
  confirmedAt?: Date | null
  // When an online order was paid, and when it was cancelled (docs/specs/044-
  // admin-cancel-order, B22): with the timestamps below they show how far a
  // cancelled order got, since the prior status isn't stored
  paidAt?: Date | null
  cancelledAt?: Date | null
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

  // The prior status isn't stored, so a cancelled order's list stops at the
  // furthest step its timestamps show it reached (none is "current": the
  // branch is). With no timestamp it never got past the first step: an
  // unpaid or unconfirmed order, which is every order the release cancels.
  if (order.status === "CANCELLED") {
    const reached = reachedIndex(sequence, order)
    return {
      steps: make(reached + 1).map((step, index) =>
        index <= reached
          ? step.state === "current"
            ? { ...step, state: "done" as const }
            : step
          : {
              status: step.status,
              label: step.label,
              state: "upcoming" as const,
            }
      ),
      branch: {
        status: "CANCELLED",
        label: LABELS.CANCELLED,
        ...(order.cancelledAt
          ? { detail: `Cancelled ${dateTimeText(order.cancelledAt)}` }
          : {}),
      },
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
