import "server-only"

import type { EmailTemplate } from "../templates"
import { emailView } from "../view"
import { renderEmail } from "./render"

// Order cancelled (docs/specs/036-order-emails, Behavior 6–7)
export const orderCancelled: EmailTemplate = async (context) =>
  renderEmail(emailView("ORDER_CANCELLED", context))
