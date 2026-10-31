import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

import { ordersEnabledSchema } from "./orders/orders-enabled-schema"

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
    // or "false", unset means off. Off in Production until #81 releases unpaid
    // orders' stock. Read through ordersEnabled().
    ORDERS_ENABLED: ordersEnabledSchema,
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
