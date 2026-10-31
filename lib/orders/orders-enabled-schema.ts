import { z } from "zod"

// The ORDERS_ENABLED switch's schema (docs/specs/030-place-an-order, D13).
// Here, and not in enabled.ts, because lib/env.ts imports it and enabled.ts
// imports lib/env.ts. Pure.
//
// Only "true" and "false" are accepted: any other value ("TRUE", "1", "yes")
// fails at startup instead of quietly meaning off. Unset means off, so a
// forgotten variable can never turn placing on (fails closed).
export const ordersEnabledSchema = z
  .enum(["true", "false"], {
    error: 'must be "true" or "false"',
  })
  .default("false")
  .transform((value) => value === "true")
