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
    "Save this link: it's the only way to see your order until order emails arrive.",
  linkLabel: "Your order link",
  copy: "Copy link",
  copied: "Link copied",
  copyFailed: "Couldn't copy. Select the link and copy it yourself.",
  subtotal: "Subtotal",
  shipping: "Shipping",
  discount: "Discount",
  total: "Total",
} as const

export const orderHeading = (orderNumber: string): string =>
  `Order ${orderNumber}`

export const orderTitle = (orderNumber: string): string =>
  `Order ${orderNumber}`
