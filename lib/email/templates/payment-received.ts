import "server-only"

import type { EmailTemplate } from "../templates"
import { emailView } from "../view"
import { renderEmail } from "./render"

// Payment received (docs/specs/036-order-emails, Behavior 4–5)
export const paymentReceived: EmailTemplate = async (context) =>
  renderEmail(emailView("PAYMENT_RECEIVED", context))
