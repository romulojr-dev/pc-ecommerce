import { z } from "zod"

// The sign-in variables' schemas (docs/specs/039-staff-sign-in-admin-shell,
// §6 Environment, ADR 0012). Here, and not in lib/auth/auth.ts, because
// lib/env.ts imports it. Pure.
//
// Messages never repeat a value: the secret and the demo password are
// secrets of a kind, and lib/env.ts prints each message after the variable's
// name.

export const BETTER_AUTH_SECRET_MIN_BYTES = 32
export const MIN_PASSWORD_LENGTH = 12

// Signs the session cookie. Required everywhere, at least 32 bytes, one per
// environment (Production, Preview, Development: session tokens are stored
// as they are and a preview branch may hold copies of production rows, so a
// shared secret would let a cookie signed in one environment open another).
// The app can't check that last rule; docs/setup/admin-accounts.md and ADR
// 0012 state it.
export const betterAuthSecretSchema = z
  .string({
    error: (issue) => (issue.input === undefined ? "is not set" : "is invalid"),
  })
  .refine(
    (value) => Buffer.byteLength(value, "utf8") >= BETTER_AUTH_SECRET_MIN_BYTES,
    `must be at least ${BETTER_AUTH_SECRET_MIN_BYTES} bytes`
  )

// The public demo account's password: shown on /admin/login and read by the
// seed's --accounts-only mode. Optional (unset: no demo box, no demo user).
export const demoAccountPasswordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `must be at least ${MIN_PASSWORD_LENGTH} characters`
  )
  .optional()

// Set by Vercel when "Enable access to System Environment Variables" is on:
// host names without a scheme (Vercel, System environment variables)
export const vercelHostSchema = z.string().min(1).optional()

export type AuthEnvValues = {
  BETTER_AUTH_SECRET?: string
  ORDER_LINK_SECRET?: string
  VERCEL_ENV?: string
  VERCEL_URL?: string
}

export type AuthEnvIssue = {
  variable: keyof AuthEnvValues
  message: string
}

// The rules that need more than one variable. VERCEL_URL builds a Preview's
// trusted origin, so a Preview without it would reject every sign-in: it
// stops at startup instead. VERCEL_BRANCH_URL is never an error (Vercel's page
// doesn't say it is always set).
export function authEnvIssues(values: AuthEnvValues): AuthEnvIssue[] {
  const issues: AuthEnvIssue[] = []
  if (
    values.BETTER_AUTH_SECRET &&
    values.BETTER_AUTH_SECRET === values.ORDER_LINK_SECRET
  ) {
    issues.push({
      variable: "BETTER_AUTH_SECRET",
      message: "must differ from ORDER_LINK_SECRET",
    })
  }
  if (values.VERCEL_ENV === "preview" && !values.VERCEL_URL) {
    issues.push({
      variable: "VERCEL_URL",
      message:
        'is not set on a Preview (turn on "Enable access to System Environment Variables" in Vercel)',
    })
  }
  return issues
}
