import { z } from "zod"

import { orderNumberShape } from "./number"
import { TRANSITION_TARGETS } from "./transitions"

// What a staff move may carry (docs/specs/043-order-fulfillment-transitions,
// R5). One schema for the browser (field messages) and the server action.
// Pure: no database.

export const COURIER_SUGGESTIONS = [
  "J&T Express",
  "LBC",
  "Ninja Van",
  "Flash Express",
  "2GO",
] as const

export const TRANSITION_MESSAGES = {
  courierRequired: "Enter the courier.",
  courierInvalid:
    "Courier must be 2 to 40 characters: letters, numbers, spaces and & . ' -",
  trackingRequired: "Enter the tracking number.",
  trackingInvalid:
    "Tracking number must be 4 to 40 characters: letters, numbers and - _ / .",
} as const

const COURIER_SHAPE = /^[A-Za-z0-9 &.'-]{2,40}$/
const TRACKING_SHAPE = /^[A-Za-z0-9\-_/.]{4,40}$/

export type ShipFieldErrors = { courier?: string; trackingNumber?: string }

// The two fields as typed (trimmed here); an error per bad field, or none
export function shipFieldErrors(input: {
  courier?: unknown
  trackingNumber?: unknown
}): ShipFieldErrors {
  const errors: ShipFieldErrors = {}
  const courier = typeof input.courier === "string" ? input.courier.trim() : ""
  const tracking =
    typeof input.trackingNumber === "string" ? input.trackingNumber.trim() : ""
  if (courier === "") errors.courier = TRANSITION_MESSAGES.courierRequired
  else if (!COURIER_SHAPE.test(courier))
    errors.courier = TRANSITION_MESSAGES.courierInvalid
  if (tracking === "") {
    errors.trackingNumber = TRANSITION_MESSAGES.trackingRequired
  } else if (!TRACKING_SHAPE.test(tracking)) {
    errors.trackingNumber = TRANSITION_MESSAGES.trackingInvalid
  }
  return errors
}

const STATUS_NAMES = [
  "PENDING_PAYMENT",
  "PENDING_CONFIRMATION",
  "PAID",
  "COD_CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "READY_FOR_PICKUP",
  "DELIVERED",
  "PICKED_UP",
  "CANCELLED",
  "REFUNDED",
] as const

export const transitionInputSchema = z
  .object({
    orderNumber: z.string().refine(orderNumberShape),
    expectedStatus: z.enum(STATUS_NAMES),
    to: z.enum(TRANSITION_TARGETS as [string, ...string[]]),
    courier: z.string().trim().optional(),
    trackingNumber: z.string().trim().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.to === "SHIPPED") {
      const errors = shipFieldErrors(value)
      for (const [path, message] of Object.entries(errors)) {
        ctx.addIssue({ code: "custom", path: [path], message })
      }
    } else if (
      value.courier !== undefined ||
      value.trackingNumber !== undefined
    ) {
      // Only Shipped carries parcel details
      ctx.addIssue({ code: "custom", message: "Unexpected parcel details" })
    }
  })

export type TransitionInput = z.output<typeof transitionInputSchema>
