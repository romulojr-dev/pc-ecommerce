import "server-only"

import type { EmailTemplate } from "../templates"
import { emailView } from "../view"
import { renderEmail } from "./render"

// Order placed (docs/specs/036-order-emails, Behavior 1–3)
export const orderPlaced: EmailTemplate = async (context) =>
  renderEmail(emailView("ORDER_PLACED", context))
