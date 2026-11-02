import { z } from "zod"

// CRON_SECRET's schema (docs/specs/033-release-unpaid-orders, D14): optional,
// since only Production's cron calls the route, and the route refuses every
// call without it (fails closed). Vercel sends it as `Authorization: Bearer
// …`. Here, and not in lib/env.ts, so it can be tested on its own. Pure.
export const cronSecretSchema = z
  .string()
  .min(16, "must be at least 16 characters")
  .optional()
