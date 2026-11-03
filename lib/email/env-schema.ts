import { z } from "zod"

// The email variables' schemas (docs/specs/035-email-foundation-signed-links,
// §6 Environment, E1–E6). Here, and not in transport.ts, because lib/env.ts
// imports it. Pure.
//
// Messages never repeat a value: the key and the secret are secrets, and
// lib/env.ts prints each message after the variable's name.

// Required, with no default: a forgotten variable stops startup instead of
// quietly sending nothing (or quietly recording)
export const emailTransportSchema = z.enum(["resend", "fake"], {
  error: (issue) =>
    issue.input === undefined ? "is not set" : "must be resend or fake",
})

export const DEFAULT_EMAIL_FROM = "PC Silicon <orders@mail.pcsilicon.tech>"

// "Name <address>" or a bare address
const FROM =
  /^(?:[^<>\r\n]+ <[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/

export const emailFromSchema = z
  .string()
  .regex(FROM, 'must be an address or "Name <address>"')
  .default(DEFAULT_EMAIL_FROM)

export const ORDER_LINK_SECRET_MIN_BYTES = 32

export const orderLinkSecretSchema = z
  .string({
    error: (issue) => (issue.input === undefined ? "is not set" : "is invalid"),
  })
  .refine(
    (value) => Buffer.byteLength(value, "utf8") >= ORDER_LINK_SECRET_MIN_BYTES,
    `must be at least ${ORDER_LINK_SECRET_MIN_BYTES} bytes`
  )

export type EmailEnvValues = {
  EMAIL_TRANSPORT?: string
  RESEND_API_KEY?: string
  VERCEL_ENV?: string
}

export type EmailEnvIssue = {
  variable: keyof EmailEnvValues
  message: string
}

// The rules that need more than one variable (E2, E3)
export function emailEnvIssues(values: EmailEnvValues): EmailEnvIssue[] {
  const issues: EmailEnvIssue[] = []
  if (values.EMAIL_TRANSPORT === "fake" && values.VERCEL_ENV === "production") {
    issues.push({
      variable: "EMAIL_TRANSPORT",
      message: "must be resend in production",
    })
  }
  if (values.EMAIL_TRANSPORT === "resend" && !values.RESEND_API_KEY) {
    issues.push({
      variable: "RESEND_API_KEY",
      message: "is not set (required with EMAIL_TRANSPORT=resend)",
    })
  }
  return issues
}
