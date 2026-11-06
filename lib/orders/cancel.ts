import { z } from "zod"

import { orderNumberShape } from "./number"
import type {
  FulfillmentName,
  OrderStatusName,
  PaymentOptionName,
} from "./timeline"

// Cancelling an order from Admin (docs/specs/044-admin-cancel-order, B1, B4,
// R4, R6, R13). The pure rules: which statuses can be cancelled, what staff
// may send, the customer-facing phrase for a reason, and when "nothing was
// received". Pure: no database.

// What the table needs to know about an order. Only the status decides; the
// rest is in the type so the table is stated for every combination (E1)
export type CancelOrder = {
  status: OrderStatusName
  fulfillment?: FulfillmentName
  paymentOption?: PaymentOptionName
}

// Written for every OrderStatus value, so a new status is a type error until
// someone decides (R6)
const CANCELLABLE: Record<OrderStatusName, boolean> = {
  PENDING_PAYMENT: true,
  PENDING_CONFIRMATION: true,
  PAID: true,
  COD_CONFIRMED: true,
  PROCESSING: true,
  SHIPPED: false,
  READY_FOR_PICKUP: true,
  DELIVERED: false,
  PICKED_UP: false,
  CANCELLED: false,
  REFUNDED: false,
}

export const canCancel = (order: CancelOrder): boolean =>
  CANCELLABLE[order.status]

export const CANCELLABLE_STATUSES = (
  Object.keys(CANCELLABLE) as OrderStatusName[]
).filter((status) => CANCELLABLE[status])

// The OrderCancelReason enum's values, written out to keep this file free of
// the generated client
export type CancelReasonName =
  "EXPIRED" | "OUT_OF_STOCK" | "CUSTOMER_REQUEST" | "OTHER"

// The reasons staff pick; EXPIRED is the release's alone (R4)
export const STAFF_CANCEL_REASONS = [
  "OUT_OF_STOCK",
  "CUSTOMER_REQUEST",
  "OTHER",
] as const
export type StaffCancelReason = (typeof STAFF_CANCEL_REASONS)[number]

export const CANCEL_REASON_LABELS: Record<StaffCancelReason, string> = {
  OUT_OF_STOCK: "Out of stock",
  CUSTOMER_REQUEST: "Customer asked to cancel",
  OTHER: "Other",
}

// The label of any stored reason, for Admin's lists
export function cancelReasonLabel(
  reason: string | null,
  paymentOption: PaymentOptionName = "ONLINE"
): string | null {
  if (reason === "EXPIRED") {
    return paymentOption === "COD"
      ? "Not confirmed in time"
      : "Not paid in time"
  }
  return reason !== null && Object.hasOwn(CANCEL_REASON_LABELS, reason)
    ? CANCEL_REASON_LABELS[reason as StaffCancelReason]
    : null
}

// What follows "because" in the customer's email and order page; none for
// Other and for anything unknown (R4)
const PHRASES: Record<string, Record<PaymentOptionName, string>> = {
  OUT_OF_STOCK: {
    ONLINE: "one of the parts is out of stock",
    COD: "one of the parts is out of stock",
  },
  CUSTOMER_REQUEST: {
    ONLINE: "you asked us to cancel it",
    COD: "you asked us to cancel it",
  },
  EXPIRED: {
    ONLINE: "it wasn't paid in time",
    COD: "it wasn't confirmed in time",
  },
}

export function cancelReasonPhrase(
  reason: string | null,
  paymentOption: PaymentOptionName = "ONLINE"
): string | null {
  return reason !== null && Object.hasOwn(PHRASES, reason)
    ? PHRASES[reason][paymentOption]
    : null
}

// "Nothing was received" (B20, R13): no paidAt and no payment in a paid state
// (a late or second payment is a Paid payment with a problem). The email and
// the order page both use it.
export function nothingReceived(order: {
  paidAt: Date | null
  payments: readonly { status: string }[]
}): boolean {
  return (
    order.paidAt === null && !order.payments.some((p) => p.status === "PAID")
  )
}

export const CANCEL_MESSAGES = {
  reasonRequired: "Choose a reason.",
  noteInvalid: "Add a note (3 to 200 characters).",
} as const

// 3 to 200 characters, none of them a control character or line break
const NOTE_MIN = 3
const NOTE_MAX = 200

// A note as typed (trimmed here): an error message, or none
export function noteError(note: unknown): string | null {
  const text = typeof note === "string" ? note.trim() : ""
  if (text.length < NOTE_MIN || text.length > NOTE_MAX) {
    return CANCEL_MESSAGES.noteInvalid
  }
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (code < 32 || code === 127) return CANCEL_MESSAGES.noteInvalid
  }
  return null
}

const STATUS_NAMES = Object.keys(CANCELLABLE) as [
  OrderStatusName,
  ...OrderStatusName[],
]

// One schema for the browser (field messages) and the server action. The note
// is required for Other and refused for the other reasons (B4)
export const cancelInputSchema = z
  .object({
    orderNumber: z.string().refine(orderNumberShape),
    expectedStatus: z.enum(STATUS_NAMES),
    reason: z.enum(STAFF_CANCEL_REASONS),
    note: z.string().trim().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.reason === "OTHER") {
      const error = noteError(value.note)
      if (error) {
        ctx.addIssue({ code: "custom", path: ["note"], message: error })
      }
    } else if (value.note !== undefined) {
      ctx.addIssue({ code: "custom", message: "Unexpected note" })
    }
  })

export type CancelInput = z.output<typeof cancelInputSchema>
