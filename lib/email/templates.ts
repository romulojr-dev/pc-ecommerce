import type { EmailType, Prisma } from "@/generated/prisma/client"

import { orderCancelled } from "./templates/order-cancelled"
import { orderPlaced } from "./templates/order-placed"
import { paymentReceived } from "./templates/payment-received"

// What each email type renders (docs/specs/035-email-foundation-signed-links,
// §6 Functions): built from the order row at send time, so a row never goes
// stale. The three order emails are registered (docs/specs/036-order-emails);
// the COD confirmation is #95's. A type with no template fails final as
// `no-template`, loudly, instead of being marked sent.

export type EmailOrder = Prisma.OrderGetPayload<{
  include: { items: true }
}>

export type EmailContent = { subject: string; html: string; text: string }

export type EmailContext = {
  order: EmailOrder
  // A fresh signed `view` link to the order, absolute, on NEXT_PUBLIC_SITE_URL
  viewUrl: string
  siteUrl: string
  // When the email is built: whether an order can still be paid is judged
  // against it (docs/specs/036-order-emails, D2)
  now: Date
  // The store's current address and hours, read for pickup orders only
  store: { address: string; hours: string } | null
}

// React Email renders asynchronously, so a template may return a promise; a
// rejection is a `render-error`, as a throw is
export type EmailTemplate = (
  context: EmailContext
) => EmailContent | Promise<EmailContent>

export type EmailTemplates = Partial<Record<EmailType, EmailTemplate>>

export const templates: EmailTemplates = {
  ORDER_PLACED: orderPlaced,
  PAYMENT_RECEIVED: paymentReceived,
  ORDER_CANCELLED: orderCancelled,
  // COD_CONFIRM is #95's: until then a row of that type fails final as
  // `no-template`
}
