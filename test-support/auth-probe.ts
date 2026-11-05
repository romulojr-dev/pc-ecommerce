import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { betterAuth } from "better-auth"

import { db } from "@/lib/db"

// A draft of the auth instance, to prove what spec 039 assumes about Better
// Auth 1.7.17 (docs/specs/039-staff-sign-in-admin-shell, plan task 1). It
// becomes lib/auth/auth.ts in task 3 and this file is deleted then.

export const PROBE_SECRET = "probe-secret-0123456789-abcdefghij-0123456789"

// The endpoints of 1.7.17 (listed from `auth.api`, with the paths below). Only
// the first three may answer; the test fails when the installed version has an
// endpoint that is in neither list.
export const ALLOWED_PATHS = ["/sign-in/email", "/sign-out", "/get-session"]
export const DISABLED_PATHS = [
  "/sign-in/social",
  "/callback/:id",
  "/sign-up/email",
  "/reset-password",
  "/verify-password",
  "/verify-email",
  "/send-verification-email",
  "/change-email",
  "/change-password",
  "/update-session",
  "/update-user",
  "/delete-user",
  "/request-password-reset",
  "/reset-password/:token",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/link-social",
  "/list-accounts",
  "/delete-user/callback",
  "/unlink-account",
  "/refresh-token",
  "/get-access-token",
  "/account-info",
  "/ok",
  "/error",
]

type Options = {
  baseURL?: string
  trustedOrigins?: string[]
  useSecureCookies?: boolean
}

export function createProbeAuth(options: Options = {}) {
  return betterAuth({
    secret: PROBE_SECRET,
    baseURL: options.baseURL ?? "http://localhost:3000",
    trustedOrigins: options.trustedOrigins,
    database: prismaAdapter(db, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
    },
    user: {
      additionalFields: {
        role: { type: "string", required: true, input: false },
        disabledAt: { type: "date", required: false, input: false },
      },
    },
    session: {
      expiresIn: 8 * 60 * 60,
      updateAge: 8 * 60 * 60,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    verification: { storeIdentifier: "hashed" },
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: { "/sign-in/email": { window: 10, max: 3 } },
    },
    advanced: {
      database: { generateId: false },
      useSecureCookies: options.useSecureCookies,
      // Off by default under NODE_ENV=test; set explicitly so tests (and CI's
      // production build) run the same origin and CSRF checks
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },
    disabledPaths: DISABLED_PATHS,
    plugins: [nextCookies()],
  })
}
