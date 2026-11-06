import "server-only"

import { cancelReasonPhrase } from "@/lib/orders/cancel"
import { ORDER_COPY } from "@/lib/orders/copy"

// Shopper copy for the three order emails (docs/specs/036-order-emails, §5).
// The order page's own headings and pickup note are reused as they are. The
// test-mode sentence is the issue's, not the checkout banner's (D4).

export const EMAIL_COPY = {
  subjectPrefix: "[Demo] ",
  testNote:
    "This is a demo store in test mode. No real money was charged and nothing will ship.",
  footer:
    "You received this email because an order was placed with this address at PC Silicon.",
  brand: "PC Silicon",
  linkNote: "Keep this email. The link opens your order for 90 days.",
  viewOrder: "View your order",
  payNow: "Pay now",
  visitShop: "Still want these parts? Visit PC Silicon",
  unpaidNote: "Unpaid orders are cancelled at that time.",
  // The cash-on-delivery confirmation (docs/specs/038-cash-on-delivery, §5)
  confirmOrder: "Confirm order",
  confirmNote: "Orders not confirmed by then are cancelled.",
  // Headings are the order page's
  itemsHeading: ORDER_COPY.itemsHeading,
  addressHeading: ORDER_COPY.addressHeading,
  pickupHeading: ORDER_COPY.pickupHeading,
  pickupNote: ORDER_COPY.pickupNote,
  subtotal: ORDER_COPY.subtotal,
  shipping: ORDER_COPY.shipping,
  discount: ORDER_COPY.discount,
  total: ORDER_COPY.total,
} as const

export const placedSubject = (orderNumber: string): string =>
  `${EMAIL_COPY.subjectPrefix}Order ${orderNumber} placed`

export const receivedSubject = (orderNumber: string): string =>
  `${EMAIL_COPY.subjectPrefix}Payment received for order ${orderNumber}`

export const cancelledSubject = (orderNumber: string): string =>
  `${EMAIL_COPY.subjectPrefix}Order ${orderNumber} was cancelled`

// The cash order's email names its action in the subject and the first line
const cashName = (pickup: boolean): string =>
  pickup ? "pay-on-pickup" : "cash-on-delivery"

export const codConfirmSubject = (
  orderNumber: string,
  pickup: boolean
): string =>
  `${EMAIL_COPY.subjectPrefix}Confirm your ${cashName(pickup)} order ${orderNumber}`

export const codConfirmLead = (orderNumber: string, pickup: boolean): string =>
  `Please confirm your ${cashName(pickup)} order ${orderNumber} to keep your parts reserved.`

export const confirmByLine = (time: string): string =>
  `Confirm by ${time}. ${EMAIL_COPY.confirmNote}`

export const greeting = (contactName: string): string => `Hi ${contactName},`

export const placedLead = (orderNumber: string): string =>
  `We received your order ${orderNumber}.`

export const receivedLead = (orderNumber: string): string =>
  `We received your payment for order ${orderNumber}.`

export const amountPaid = (amount: string): string => `Amount paid: ${amount}`

export const statusLine = (label: string): string => `Status: ${label}`

// The cancelled lead (docs/specs/044-admin-cancel-order, B20): the sentence,
// the reason phrase when there is one, then exactly one closing sentence by
// whether anything was received.
export const cancelledLead = (
  orderNumber: string,
  cancelReason: string | null,
  paymentOption: "ONLINE" | "COD" = "ONLINE",
  received = false
): string => {
  const phrase = cancelReasonPhrase(cancelReason, paymentOption)
  const closing = received
    ? "We'll refund your payment."
    : "You haven't been charged."
  return `Your order ${orderNumber} was cancelled${phrase ? ` because ${phrase}` : ""}. ${closing}`
}
