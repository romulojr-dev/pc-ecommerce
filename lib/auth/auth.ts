import "server-only"

import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { nextCookies } from "better-auth/next-js"

import { db } from "@/lib/db"
import { env } from "@/lib/env"

import { DISABLED_AUTH_PATHS } from "./disabled-paths"
import { MIN_PASSWORD_LENGTH } from "./env-schema"
import { baseUrlFor, trustedOriginsFor } from "./origins"
import { MAX_PASSWORD_LENGTH } from "./password-policy"
import { SIGN_IN_LIMIT, SIGN_IN_PATH } from "./rate-limit"

// The one Better Auth instance (docs/specs/039-staff-sign-in-admin-shell,
// ADR 0012). Staff only: nobody signs up, `role` and `disabledAt` are set by
// server code, and the route in app/api/auth only forwards sign-in, sign-out
// and get-session (lib/auth/route-guard.ts). Every choice below was proven
// against the pinned version in lib/auth/auth.db.test.ts.

// A session lasts 8 hours from sign-in, absolutely
const SESSION_SECONDS = 8 * 60 * 60

type Overrides = {
  baseURL?: string
  trustedOrigins?: string[]
}

export function createAuth(overrides: Overrides = {}) {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: overrides.baseURL ?? baseUrlFor(env),
    trustedOrigins: overrides.trustedOrigins ?? trustedOriginsFor(env),
    database: prismaAdapter(db, { provider: "postgresql" }),

    // Ids are cuids made by the database default (@default(cuid()))
    advanced: {
      database: { generateId: false },
      // Off by default under NODE_ENV=test; set explicitly so tests and the
      // production build CI serves run the same origin and CSRF checks
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },

    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
    },

    user: {
      additionalFields: {
        // Server-owned: `input: false` keeps any request from setting them
        role: { type: "string", required: true, input: false },
        disabledAt: { type: "date", required: false, input: false },
      },
    },

    session: {
      expiresIn: SESSION_SECONDS,
      // Absolute: nothing refreshes or extends a session, and the cookie
      // cache is off so every request reads the row
      updateAge: SESSION_SECONDS,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },

    // There are no auth emails, so nothing is written here; if a row is ever
    // written it never holds the plain identifier
    verification: { storeIdentifier: "hashed" },

    // On in every environment (Better Auth enables it only in production by
    // default), in the database because serverless instances share no memory,
    // keyed by client IP and path
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: { [SIGN_IN_PATH]: { ...SIGN_IN_LIMIT } },
    },

    disabledPaths: DISABLED_AUTH_PATHS,

    hooks: {
      // A disabled user gets the answer a wrong password gets (no account
      // enumeration); the stored password is never checked for them
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== SIGN_IN_PATH) return
        const email = (ctx.body as { email?: unknown } | undefined)?.email
        if (typeof email !== "string") return
        const user = await db.user.findUnique({
          where: { email: email.trim().toLowerCase() },
          select: { disabledAt: true },
        })
        if (user?.disabledAt) {
          throw new APIError("UNAUTHORIZED", {
            code: "INVALID_EMAIL_OR_PASSWORD",
            message: "Invalid email or password",
          })
        }
      }),
    },

    databaseHooks: {
      session: {
        // Second lock: no session for a disabled user, whatever the path
        create: {
          before: async (session) => {
            const user = await db.user.findUnique({
              where: { id: session.userId },
              select: { disabledAt: true },
            })
            if (user?.disabledAt) return false
          },
        },
      },
    },

    // Last, as Better Auth requires
    plugins: [nextCookies()],
  })
}

export const auth = createAuth()
