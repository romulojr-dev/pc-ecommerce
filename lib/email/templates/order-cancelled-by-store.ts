import "server-only"

import type { EmailTemplate } from "../templates"
import { emailView } from "../view"
import { renderEmail } from "./render"

// Order cancelled by the store (docs/specs/044-admin-cancel-order, B20): the
// staff cancel's own type, exempt from the per-recipient cap. The release keeps
// ORDER_CANCELLED, which stays capped.
export const orderCancelledByStore: EmailTemplate = async (context) =>
  renderEmail(emailView("ORDER_CANCELLED_BY_STORE", context))
