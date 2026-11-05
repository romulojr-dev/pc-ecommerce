import "server-only"

import type { EmailTemplate } from "../templates"
import { emailView } from "../view"
import { renderEmail } from "./render"

// Ready for pickup (docs/specs/043-order-fulfillment-transitions, B18)
export const readyForPickup: EmailTemplate = async (context) =>
  renderEmail(emailView("READY_FOR_PICKUP", context))
