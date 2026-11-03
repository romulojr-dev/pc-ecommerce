import "server-only"

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

export const greeting = (contactName: string): string => `Hi ${contactName},`

export const placedLead = (orderNumber: string): string =>
  `We received your order ${orderNumber}.`

export const receivedLead = (orderNumber: string): string =>
  `We received your payment for order ${orderNumber}.`

export const amountPaid = (amount: string): string => `Amount paid: ${amount}`

export const statusLine = (label: string): string => `Status: ${label}`

// The reason an order was cancelled, keyed by Order.cancelReason; "not
// confirmed in time" arrives with COD (#95)
const CANCEL_REASONS: Record<string, string> = {
  EXPIRED: "it wasn't paid in time",
}

export const cancelledLead = (
  orderNumber: string,
  cancelReason: string | null
): string => {
  const reason =
    cancelReason !== null && Object.hasOwn(CANCEL_REASONS, cancelReason)
      ? CANCEL_REASONS[cancelReason]
      : null
  return reason
    ? `Your order ${orderNumber} was cancelled because ${reason}. You haven't been charged.`
    : `Your order ${orderNumber} was cancelled.`
}
