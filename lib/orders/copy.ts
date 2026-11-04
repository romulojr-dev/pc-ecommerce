import { formatPeso } from "@/lib/format"

import { dateTimeText } from "./time"

// Shopper copy for the order page (docs/specs/030-place-an-order, §5)

export const ORDER_COPY = {
  statusHeading: "Order status",
  itemsHeading: "Items",
  summaryHeading: "Order summary",
  contactHeading: "Contact",
  addressHeading: "Delivery address",
  pickupHeading: "Pick up at",
  pickupNote:
    "Bring your order number and a valid ID when you collect your order.",
  // Pending past expiresAt, or cancelled for it (docs/specs/033-release-
  // unpaid-orders, behavior 31)
  cancelledExpired:
    "This order was cancelled because it wasn't paid in time. Place a new order if you still want these parts.",
  saveLink:
    "Save this link to see your order. We're also emailing you a link to it; if it doesn't arrive, this one still works.",
  linkLabel: "Your order link",
  copy: "Copy link",
  copied: "Link copied",
  copyFailed: "Couldn't copy. Select the link and copy it yourself.",
  subtotal: "Subtotal",
  shipping: "Shipping",
  discount: "Discount",
  total: "Total",
} as const

// The summary's discount row, named for the voucher it came from
// (docs/specs/037-vouchers-at-checkout, Behavior 19)
export const discountLabel = (code: string): string =>
  `${ORDER_COPY.discount} (${code})`

// Cash on delivery and pay on pickup (docs/specs/038-cash-on-delivery, §5)
export const COD_ORDER_COPY = {
  paymentRow: "Payment",
  cashOnDelivery: "Cash on delivery",
  payOnPickup: "Pay on pickup",
  // Pending confirmation past its deadline, or cancelled for it
  cancelledNotConfirmed:
    "This order was cancelled because it wasn't confirmed in time. Place a new order if you still want these parts.",
  // The confirm page
  confirmHeading: "Confirm your order",
  confirm: "Confirm order",
  confirming: "Confirming…",
  confirmedNow: "Order confirmed. Thank you.",
  alreadyConfirmed: "This order is already confirmed.",
  confirmFailed: "We couldn't confirm your order. Try again.",
  visitShop: "Visit PC Silicon",
} as const

// The payment row's value
export const paymentOptionText = (pickup: boolean): string =>
  pickup ? COD_ORDER_COPY.payOnPickup : COD_ORDER_COPY.cashOnDelivery

// The pending order page: where the confirmation went and what happens if it
// doesn't arrive
export const checkEmailText = (sender: string, expiresAt: Date): string =>
  `Check your email (from ${sender}) to confirm this order. If it doesn't arrive, the order cancels itself at ${dateTimeText(expiresAt)} and you can place a new one.`

export const codConfirmedText = (total: number, pickup: boolean): string =>
  `You confirmed this order. Pay ${formatPeso(total)} in cash when ${pickup ? "you collect it" : "it arrives"}.`

// The confirm page's lead and pay line
export const confirmLead = (orderNumber: string, expiresAt: Date): string =>
  `Order ${orderNumber}. Confirm it to keep your parts reserved until ${dateTimeText(expiresAt)}.`

export const confirmPayLine = (total: number, pickup: boolean): string =>
  pickup
    ? `You'll pay ${formatPeso(total)} in cash at the store when you collect it.`
    : `You'll pay ${formatPeso(total)} in cash when your order arrives.`

export const orderHeading = (orderNumber: string): string =>
  `Order ${orderNumber}`

export const orderTitle = (orderNumber: string): string =>
  `Order ${orderNumber}`

export const confirmTitle = (orderNumber: string): string =>
  `Confirm order ${orderNumber}`
