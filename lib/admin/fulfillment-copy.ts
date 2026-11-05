// The Fulfillment section's strings (docs/specs/043-order-fulfillment-
// transitions, §5). Plain data: the panel, its view-model and the tests share
// them.

import type { TransitionTarget } from "@/lib/orders/transitions"

export const FULFILLMENT_COPY = {
  heading: "Fulfillment",
  currentStatus: (label: string) => `Status: ${label}`,
  buttons: {
    PROCESSING: "Start processing",
    SHIPPED: "Mark as shipped",
    READY_FOR_PICKUP: "Mark as ready for pickup",
    DELIVERED: "Mark as delivered",
    PICKED_UP: "Mark as picked up",
  } satisfies Record<TransitionTarget, string>,
  confirmTitle: (orderNumber: string, status: string) =>
    `Mark order ${orderNumber} as ${status}?`,
  shipTitle: (orderNumber: string) => `Ship order ${orderNumber}`,
  checkTitle: "Check these details",
  courier: "Courier",
  trackingNumber: "Tracking number",
  describe: "Review this change, then confirm it.",
  noUndo: "This can't be undone.",
  emailed: "An email goes to the customer.",
  notEmailed: "No email is sent for this step.",
  detailsEmailed: "Both are emailed to the customer and can't be changed.",
  cashPaid: (total: string) => `${total} will be recorded as paid in cash.`,
  confirm: "Confirm",
  next: "Review",
  back: "Back",
  cancel: "Cancel",
  busy: "Updating…",
  reload: "Reload",
  stale:
    "This order was changed by someone else. Reload to see its current status.",
  notAllowed: "That change isn't allowed for this order.",
  notFound: "This order wasn't found.",
  failed: "Couldn't update the order. Try again.",
  // The statuses with no button, one line each
  reasons: {
    PENDING_PAYMENT:
      "Waiting for the customer. Cancel is the only change available.",
    PENDING_CONFIRMATION:
      "Waiting for the customer. Cancel is the only change available.",
    SHIPPED: "Shipped. Mark it as delivered when the courier reports delivery.",
    DELIVERED: "Delivered. Nothing more to do here.",
    PICKED_UP: "Picked up. Nothing more to do here.",
    CANCELLED: "Cancelled.",
    REFUNDED: "Refunded.",
  } as Record<string, string>,
  success: {
    PROCESSING: "Marked as processing.",
    SHIPPED: "Marked as shipped. The customer will get an email shortly.",
    READY_FOR_PICKUP:
      "Marked as ready for pickup. The customer will get an email shortly.",
    DELIVERED: "Marked as delivered. The customer will get an email shortly.",
    PICKED_UP: "Marked as picked up.",
  } satisfies Record<TransitionTarget, string>,
  // The admin events list
  events: {
    processing: (time: string) => `Processing started ${time}`,
    shipped: (time: string) => `Shipped ${time}`,
    ready: (time: string) => `Ready for pickup ${time}`,
    delivered: (time: string) => `Delivered ${time}`,
    pickedUp: (time: string) => `Picked up ${time}`,
    courier: (courier: string) => `Courier: ${courier}`,
    tracking: (number: string) => `Tracking number: ${number}`,
  },
  // The packing slip
  slip: { courier: "Courier", trackingNumber: "Tracking number" },
} as const
