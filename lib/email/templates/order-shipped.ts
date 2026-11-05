import "server-only"

import type { EmailTemplate } from "../templates"
import { emailView } from "../view"
import { renderEmail } from "./render"

// Order shipped (docs/specs/043-order-fulfillment-transitions, B18)
export const orderShipped: EmailTemplate = async (context) =>
  renderEmail(emailView("ORDER_SHIPPED", context))
