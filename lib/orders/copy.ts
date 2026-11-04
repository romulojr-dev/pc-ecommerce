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

export const orderHeading = (orderNumber: string): string =>
  `Order ${orderNumber}`

export const orderTitle = (orderNumber: string): string =>
  `Order ${orderNumber}`
