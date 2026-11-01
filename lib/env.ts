import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

import { cronSecretSchema } from "./orders/cron-secret-schema"
import { ordersEnabledSchema } from "./orders/orders-enabled-schema"
import {
  paymentEnvIssues,
  paymentGatewaySchema,
  vercelEnvSchema,
} from "./payments/env-schema"

const postgresUrl = () =>
  z.url({
    protocol: /^postgres(ql)?$/,
    error: (issue) =>
      issue.input === undefined
        ? "is not set"
        : "must be a postgres:// or postgresql:// URL",
  })

export const env = createEnv({
  server: {
    // Pooled connection, used by the app at runtime
    DATABASE_URL: postgresUrl(),
    // Direct connection, used by Prisma migrations
    DATABASE_URL_UNPOOLED: postgresUrl(),
    // The production database's host, so `pnpm db:seed --reset` can refuse
    // to run against it (docs/specs/022-share-build, ADR 0007). Only that
    // script reads it, so the app doesn't need it.
    PRODUCTION_DATABASE_HOST: z.string().min(1).optional(),
    // Whether Place order works (docs/specs/030-place-an-order, D13): "true"
    // or "false", unset means off. Off in Production until #81 (unpaid orders
    // release their stock, docs/specs/033-release-unpaid-orders) is deployed.
    // Read through ordersEnabled().
    ORDERS_ENABLED: ordersEnabledSchema,
    // What Vercel's cron sends as `Authorization: Bearer …` to
    // GET /api/cron/release-orders (docs/specs/033-release-unpaid-orders).
    // Optional: unset, the route refuses every call. Never logged.
    CRON_SECRET: cronSecretSchema,
    // The payment gateway (docs/specs/031-pay-with-xendit, ADR 0010):
    // "xendit" or "fake", required; Production refuses the fake. The rules
    // across these variables are in createFinalSchema below.
    PAYMENT_GATEWAY: paymentGatewaySchema,
    // Xendit's secret key, test mode only (xnd_development_…). Never logged.
    XENDIT_SECRET_KEY: z.string().optional(),
    // Xendit's webhook verification token (x-callback-token), checked by
    // POST /api/webhooks/xendit; the fake's payment page sends it too.
    // Required with both gateways (docs/specs/032-payment-webhooks).
    XENDIT_WEBHOOK_TOKEN: z.string().optional(),
    // Set by Vercel: production, preview or development. Unset locally and in
    // CI, which count as development (lib/payments/gateway.ts).
    VERCEL_ENV: vercelEnvSchema,
  },
  client: {
    NEXT_PUBLIC_SITE_URL: z.url({
      error: (issue) =>
        issue.input === undefined ? "is not set" : "must be a URL",
    }),
  },
  // Server vars are read from process.env automatically; client vars must be
  // listed so Next.js can inline them into the browser bundle.
  experimental__runtimeEnv: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
  emptyStringAsUndefined: true,
  // Rules across variables (spec 031, E1–E7). Only on the server: the browser
  // has none of the server variables to check.
  createFinalSchema: (shape, isServer) =>
    z.object(shape).superRefine((values, ctx) => {
      if (!isServer) return
      for (const { variable, message } of paymentEnvIssues(values)) {
        ctx.addIssue({ code: "custom", path: [variable], message })
      }
    }),
  // Escape hatch for tooling that loads this file without real env vars
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  onValidationError: (issues) => {
    const lines = issues.map((issue) => {
      const name = issue.path
        ?.map((p) => (typeof p === "object" ? p.key : p))
        .join(".")
      return `  - ${name ?? "(unknown)"} ${issue.message}`
    })
    throw new Error(
      [
        "Invalid environment variables:",
        ...lines,
        "Set them in .env.local (see .env.example) or in the Vercel project settings.",
      ].join("\n")
    )
  },
})
