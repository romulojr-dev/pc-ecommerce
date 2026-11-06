"use server"

import { adminAction } from "@/lib/admin/guard"
import { cancelOrder, finishCancel } from "@/lib/admin/orders/cancel"
import { transitionOrder } from "@/lib/admin/orders/transition"
import { scheduleEmailSend } from "@/lib/email/schedule"
import { cancelInputSchema } from "@/lib/orders/cancel"
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

// Cancel an order (docs/specs/044-admin-cancel-order). Built with adminAction
// like the move above. The email and the products tag are handled after the
// transaction has committed, and neither can fail the cancel.
export const cancelOrderAction = adminAction(
  "orders.cancel",
  cancelInputSchema,
  async ({ actor, input }) => {
    const result = await cancelOrder(actor, input)
    finishCancel(result)
    if (result.kind === "done") {
      return {
        kind: "done" as const,
        refundRequired: result.refundRequired,
      }
    }
    return result
  }
)
