import type { EmailType, Prisma } from "@/generated/prisma/client"

import { codConfirm } from "./templates/cod-confirm"
import { orderCancelled } from "./templates/order-cancelled"
import { orderDelivered } from "./templates/order-delivered"
import { orderPlaced } from "./templates/order-placed"
import { orderShipped } from "./templates/order-shipped"
import { paymentReceived } from "./templates/payment-received"
import { readyForPickup } from "./templates/ready-for-pickup"

// What each email type renders (docs/specs/035-email-foundation-signed-links,
// §6 Functions): built from the order row at send time, so a row never goes
// stale. The order emails are registered (docs/specs/036-order-emails, and the
// cash order's confirmation, docs/specs/038-cash-on-delivery);
// the COD confirmation is spec 038's. A type with no template fails final as
// `no-template`, loudly, instead of being marked sent.

export type EmailOrder = Prisma.OrderGetPayload<{
  include: { items: true }
}>

export type EmailContent = { subject: string; html: string; text: string }

export type EmailContext = {
  order: EmailOrder
  // A fresh signed `view` link to the order, absolute, on NEXT_PUBLIC_SITE_URL
  viewUrl: string
  // A cash order's `cod-confirm` link, absolute (docs/specs/038-cash-on-
  // delivery, Behavior 15); null for an online order
  confirmUrl: string | null
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
  COD_CONFIRM: codConfirm,
  ORDER_SHIPPED: orderShipped,
  READY_FOR_PICKUP: readyForPickup,
  ORDER_DELIVERED: orderDelivered,
}
