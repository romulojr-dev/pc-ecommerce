import { formatPeso } from "@/lib/format"
import {
  type FulfillmentName,
  type OrderStatusName,
  type PaymentOptionName,
  statusLabel,
} from "@/lib/orders/timeline"

// What Admin's order screens say, as pure functions of order data
// (docs/specs/041-admin-orders-list-detail, §5). No database.

// "Ready to pack" is Processing and nothing else (D12): Paid and COD
// confirmed orders carry the warning until #108 moves them to Processing.
export const readyToPack = (status: OrderStatusName): boolean =>
  status === "PROCESSING"

export function slipWarning(status: OrderStatusName): string | null {
  return readyToPack(status)
    ? null
    : `Do not ship: this order is ${statusLabel(status)}.`
}

// The Payment column (B2, §5). paymentMethod is the gateway channel, set once
// an online order is paid.
export function paymentCell(order: {
  paymentOption: PaymentOptionName
  fulfillment: FulfillmentName
  paymentMethod: string | null
}): string {
  if (order.paymentOption === "COD") {
    return order.fulfillment === "PICKUP" ? "Pay on pickup" : "Cash on delivery"
  }
  switch (order.paymentMethod) {
    case "GCASH":
      return "Online (GCash)"
    case "PAYMAYA":
      return "Online (Maya)"
    case "CARDS":
      return "Online (Card)"
    default:
      return "Online"
  }
}

// The detail's "Amount to collect": a cash order not yet delivered or picked up
// (no paidAt) and not cancelled or refunded (B12, E26a)
export function amountToCollect(order: {
  paymentOption: PaymentOptionName
  fulfillment: FulfillmentName
  status: OrderStatusName
  paidAt: Date | null
  total: number
}): string | null {
  if (order.paymentOption !== "COD" || order.paidAt !== null) return null
  if (order.status === "CANCELLED" || order.status === "REFUNDED") return null
  return `Amount to collect ${formatPeso(order.total)} on ${
    order.fulfillment === "PICKUP" ? "pickup" : "delivery"
  }`
}

// The packing slip's payment line: no amount (D6)
export function slipPaymentLine(order: {
  paymentOption: PaymentOptionName
  fulfillment: FulfillmentName
  paidAt: Date | null
}): string {
  if (order.paymentOption === "COD") {
    return order.fulfillment === "PICKUP"
      ? "Collect payment on pickup"
      : "Collect payment"
  }
  return order.paidAt ? "Paid online" : "Not yet paid"
}

export type PaymentProblemName = "AMOUNT_MISMATCH" | "LATE" | "SECOND_PAYMENT"

export const PAYMENT_PROBLEM_LABELS: Record<PaymentProblemName, string> = {
  AMOUNT_MISMATCH: "Amount didn't match",
  LATE: "Paid after cancellation",
  SECOND_PAYMENT: "Second payment",
}

export type PaymentStatusName =
  "OPENING" | "PENDING" | "PAID" | "FAILED" | "EXPIRED"

export const PAYMENT_STATUS_LABELS: Record<PaymentStatusName, string> = {
  OPENING: "Opening",
  PENDING: "Pending",
  PAID: "Paid",
  FAILED: "Failed",
  EXPIRED: "Expired",
}

export type EmailTypeName =
  | "ORDER_PLACED"
  | "PAYMENT_RECEIVED"
  | "ORDER_CANCELLED"
  | "COD_CONFIRM"
  | "ORDER_SHIPPED"
  | "READY_FOR_PICKUP"
  | "ORDER_DELIVERED"

export const EMAIL_TYPE_LABELS: Record<EmailTypeName, string> = {
  ORDER_PLACED: "Order placed",
  PAYMENT_RECEIVED: "Payment received",
  ORDER_CANCELLED: "Order cancelled",
  COD_CONFIRM: "Cash order confirmation",
  ORDER_SHIPPED: "Order shipped",
  READY_FOR_PICKUP: "Ready for pickup",
  ORDER_DELIVERED: "Order delivered",
}

export type EmailStatusName =
  "PENDING" | "SENDING" | "SENT" | "FAILED" | "SKIPPED"

export const EMAIL_STATUS_LABELS: Record<EmailStatusName, string> = {
  PENDING: "Queued",
  SENDING: "Sending",
  SENT: "Sent",
  FAILED: "Failed",
  SKIPPED: "Skipped",
}

export const FULFILLMENT_LABELS: Record<FulfillmentName, string> = {
  DELIVERY: "Delivery",
  PICKUP: "Store pickup",
}

// ---- The packing slip's items ----

export type SlipItemLine = {
  name: string
  quantity: number
  buildId: string | null
  slot: string | null
}

export type SlipEntry =
  | { kind: "single"; item: SlipItemLine }
  // number is 1-based, only when the order has two or more build groups
  | { kind: "build"; number: number | null; parts: SlipItemLine[] }

// Like orderEntries (the order page's grouping) but with no prices: a single
// line stays a line, and a build's parts gather where its first part was
export function slipEntries(items: readonly SlipItemLine[]): SlipEntry[] {
  const entries: SlipEntry[] = []
  const groups = new Map<string, Extract<SlipEntry, { kind: "build" }>>()
  for (const item of items) {
    if (item.buildId === null) {
      entries.push({ kind: "single", item })
      continue
    }
    let group = groups.get(item.buildId)
    if (!group) {
      group = { kind: "build", number: null, parts: [] }
      groups.set(item.buildId, group)
      entries.push(group)
    }
    group.parts.push(item)
  }
  if (groups.size >= 2) {
    let number = 0
    for (const entry of entries) {
      if (entry.kind === "build") entry.number = ++number
    }
  }
  return entries
}
