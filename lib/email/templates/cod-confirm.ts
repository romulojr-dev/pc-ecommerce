import "server-only"

import type { EmailTemplate } from "../templates"
import { emailView } from "../view"
import { renderEmail } from "./render"

// The cash order's confirmation (docs/specs/038-cash-on-delivery, Behavior
// 15): the order summary and a Confirm order button to the signed link
export const codConfirm: EmailTemplate = async (context) =>
  renderEmail(emailView("COD_CONFIRM", context))
