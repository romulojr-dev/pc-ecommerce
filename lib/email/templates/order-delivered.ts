import "server-only"

import type { EmailTemplate } from "../templates"
import { emailView } from "../view"
import { renderEmail } from "./render"

// Order delivered (docs/specs/043-order-fulfillment-transitions, B18)
export const orderDelivered: EmailTemplate = async (context) =>
  renderEmail(emailView("ORDER_DELIVERED", context))
