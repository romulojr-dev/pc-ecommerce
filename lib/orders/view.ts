import type { PaymentsSummary } from "@/lib/payments/payment-view"

import type { CancelReasonName } from "./cancel"

import type {
  FulfillmentName,
  OrderStatusName,
  PaymentOptionName,
} from "./timeline"

// What the order page shows (docs/specs/030-place-an-order, Behavior 18), as
// plain data read from the order's snapshots. Pure: the page's loader fills it
// and the components only draw it.

export type OrderPageItem = {
  name: string
  // Centavos, per unit, as they were when the order was placed
  unitPrice: number
  quantity: number
  buildId: string | null
  slot: string | null
}

export type OrderPageData = {
  orderNumber: string
  // Opened with a signed link from an email: the page doesn't offer to save
  // the link (docs/specs/035-email-foundation-signed-links, D8)
  viaLink: boolean
  status: OrderStatusName
  fulfillment: FulfillmentName
  // How it is paid: online, or cash on delivery / on pickup (docs/specs/038-
  // cash-on-delivery)
  paymentOption: PaymentOptionName
  // When a cash order was confirmed from its email
  confirmedAt: Date | null
  // The staff's fulfillment moves (docs/specs/043-order-fulfillment-
  // transitions); completedAt is Delivered or Picked up
  processingAt: Date | null
  shippedAt: Date | null
  readyAt: Date | null
  completedAt: Date | null
  courier: string | null
  trackingNumber: string | null
  createdAt: Date
  expiresAt: Date
  contact: { name: string; email: string; mobile: string }
  // Delivery only: the street, and the places as the dataset named them
  address: {
    street: string
    barangay: string
    city: string
    province: string
    region: string
    zip: string
  } | null
  // Pickup only: the store's current address and hours (D5)
  store: { address: string; hours: string } | null
  // In the order's position order: cart order, and slot order inside a group
  items: OrderPageItem[]
  subtotal: number
  shippingFee: number
  discount: number
  // The voucher the discount came from, as it was (docs/specs/037-vouchers-at-
  // checkout, Behavior 19)
  voucherCode: string | null
  total: number
  // docs/specs/032-payment-webhooks: set when the gateway confirmed a payment
  paidAt: Date | null
  // The gateway's channel code (GCASH, PAYMAYA, CARDS, FAKE)
  paymentMethod: string | null
  // A late or second payment to refund (FR-26)
  refundRequired: boolean
  // Why it was cancelled (docs/specs/033-release-unpaid-orders)
  cancelReason: CancelReasonName | null
  // When it was cancelled, and whether nothing was received (no paidAt and no
  // Paid payment, late and second payments included; docs/specs/044-admin-
  // cancel-order, R13)
  cancelledAt: Date | null
  nothingReceived: boolean
  payments: PaymentsSummary
}

export type OrderEntry =
  | { kind: "single"; item: OrderPageItem }
  | {
      kind: "build"
      buildId: string
      // 1-based, only when the order has two or more groups
      number: number | null
      parts: OrderPageItem[]
      total: number
    }

// The items grouped as the cart showed them: a single line stays a line, and a
// build's parts gather where its first part was
export function orderEntries(items: readonly OrderPageItem[]): OrderEntry[] {
  const entries: OrderEntry[] = []
  const groups = new Map<string, Extract<OrderEntry, { kind: "build" }>>()
  for (const item of items) {
    if (item.buildId === null) {
      entries.push({ kind: "single", item })
      continue
    }
    let group = groups.get(item.buildId)
    if (!group) {
      group = {
        kind: "build",
        buildId: item.buildId,
        number: null,
        parts: [],
        total: 0,
      }
      groups.set(item.buildId, group)
      entries.push(group)
    }
    group.parts.push(item)
    group.total += item.unitPrice * item.quantity
  }
  if (groups.size >= 2) {
    let number = 0
    for (const entry of entries) {
      if (entry.kind === "build") entry.number = ++number
    }
  }
  return entries
}
