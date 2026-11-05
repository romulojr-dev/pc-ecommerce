"use server"

import { adminAction } from "@/lib/admin/guard"
import { transitionOrder } from "@/lib/admin/orders/transition"
import { scheduleEmailSend } from "@/lib/email/schedule"
import { transitionInputSchema } from "@/lib/orders/transition-input"

// Move an order through fulfillment (docs/specs/043-order-fulfillment-
// transitions). Built with adminAction: origin, session and `can()` are
// checked before the input is read. The email is scheduled after the
// transaction has committed, and never fails the move.
export const transitionOrderAction = adminAction(
  "orders.transition",
  transitionInputSchema,
  async ({ actor, input }) => {
    const result = await transitionOrder(actor, input)
    if (result.kind === "done") {
      if (result.emailId) scheduleEmailSend(result.emailId)
      return {
        kind: "done" as const,
        status: result.status,
        emails: result.emails,
      }
    }
    return result
  }
)
