import { z } from "zod"

// The payment variables' schemas (docs/specs/031-pay-with-xendit, §6
// Environment variables, E1–E7; ADR 0010). Here, and not in gateway.ts,
// because lib/env.ts imports it. Pure.
//
// Messages never repeat a value: the key is a secret, and lib/env.ts prints
// each message after the variable's name.

export const TEST_KEY_PREFIX = "xnd_development_"
export const LIVE_KEY_PREFIX = "xnd_production_"

// Required, with no default: a forgotten variable stops startup instead of
// quietly running the fake (D12)
export const paymentGatewaySchema = z.enum(["xendit", "fake"], {
  error: (issue) =>
    issue.input === undefined ? "is not set" : "must be xendit or fake",
})

// Set by Vercel; unset in local runs and CI, which count as development
export const vercelEnvSchema = z
  .enum(["production", "preview", "development"], {
    error: "must be production, preview or development",
  })
  .optional()

export type PaymentEnvValues = {
  PAYMENT_GATEWAY?: string
  XENDIT_SECRET_KEY?: string
  XENDIT_WEBHOOK_TOKEN?: string
  VERCEL_ENV?: string
  NEXT_PUBLIC_SITE_URL?: string
}

export type PaymentEnvIssue = {
  variable: keyof PaymentEnvValues
  message: string
}

// The rules that need more than one variable (E1–E5, E7). A live key is
// refused in every environment, whichever gateway is chosen.
export function paymentEnvIssues(values: PaymentEnvValues): PaymentEnvIssue[] {
  const issues: PaymentEnvIssue[] = []
  const gateway = values.PAYMENT_GATEWAY
  const key = values.XENDIT_SECRET_KEY

  if (gateway === "fake" && values.VERCEL_ENV === "production") {
    issues.push({
      variable: "PAYMENT_GATEWAY",
      message: "must be xendit in production",
    })
  }
  if (key?.startsWith(LIVE_KEY_PREFIX)) {
    issues.push({
      variable: "XENDIT_SECRET_KEY",
      message: `must be a test-mode key (${TEST_KEY_PREFIX}…), never a live one`,
    })
  } else if (key && !key.startsWith(TEST_KEY_PREFIX)) {
    issues.push({
      variable: "XENDIT_SECRET_KEY",
      message: `must be a test-mode key (${TEST_KEY_PREFIX}…)`,
    })
  }
  if (gateway === "xendit") {
    if (!key) {
      issues.push({ variable: "XENDIT_SECRET_KEY", message: "is not set" })
    }
    if (!values.NEXT_PUBLIC_SITE_URL?.startsWith("https://")) {
      issues.push({
        variable: "NEXT_PUBLIC_SITE_URL",
        message: "must be https with the xendit gateway",
      })
    }
  }
  // The fake's Pay builds an event with the verification token (spec 031,
  // §6 Fake adapter), and the webhook route checks it with either gateway
  // (docs/specs/032-payment-webhooks, E8)
  if (
    (gateway === "fake" || gateway === "xendit") &&
    !values.XENDIT_WEBHOOK_TOKEN
  ) {
    issues.push({ variable: "XENDIT_WEBHOOK_TOKEN", message: "is not set" })
  }
  return issues
}
