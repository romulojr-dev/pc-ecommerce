import { z } from "zod"

// PSGC has no ZIP codes, so the ZIP stays a 4-digit text field: exactly four
// digits, leading zeros kept ("0900" is valid), and nothing checked against
// the place (docs/specs/028-shipping-data-and-fee-rules, Behavior 7). It is
// not trimmed; the form trims what the shopper types before it checks.
export const zipSchema = z
  .string()
  .regex(/^\d{4}$/, "Enter a 4-digit ZIP code.")
