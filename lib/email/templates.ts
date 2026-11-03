import type { EmailType, Prisma } from "@/generated/prisma/client"

// What each email type renders (docs/specs/035-email-foundation-signed-links,
// §6 Functions): built from the order row at send time, so a row never goes
// stale. The registry is empty in this story; the three order emails are #93's
// and the COD confirmation #95's. A type with no template fails final as
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
}

export type EmailTemplate = (context: EmailContext) => EmailContent

export type EmailTemplates = Partial<Record<EmailType, EmailTemplate>>

export const templates: EmailTemplates = {}
