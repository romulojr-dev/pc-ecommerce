import { z } from "zod"

import { checkoutInputSchema } from "./input"

// What the shopper has typed in step 1, kept in the tab's sessionStorage
// (docs/specs/029-checkout-steps, Behavior 8, D4). Loose on purpose: a half
// filled form is kept so the shopper can finish it. Only text: no prices, no
// cart, and no place names (the lists are loaded again and the server names
// the places). Pure.

export const CHECKOUT_STORAGE_KEY = "pc-silicon-checkout"
export const CHECKOUT_STORAGE_VERSION = 1

export const draftSchema = z.object({
  email: z.string().default(""),
  name: z.string().default(""),
  mobile: z.string().default(""),
  method: z.enum(["delivery", "pickup"]).default("delivery"),
  regionCode: z.string().default(""),
  provinceCode: z.string().default(""),
  cityCode: z.string().default(""),
  barangayCode: z.string().default(""),
  street: z.string().default(""),
  zip: z.string().default(""),
})

export type CheckoutDraft = z.output<typeof draftSchema>

export const emptyDraft = (): CheckoutDraft => draftSchema.parse({})

// Anything stored that isn't a draft (a hand edit, a bad write) reads as an
// empty one
export function parseDraft(value: unknown): CheckoutDraft {
  const parsed = draftSchema.safeParse(value)
  return parsed.success ? parsed.data : emptyDraft()
}

// The draft as the payload step 2 sends and the server checks again. Pickup
// carries no address.
export function draftPayload(draft: CheckoutDraft) {
  const contact = {
    email: draft.email,
    name: draft.name,
    mobile: draft.mobile,
  }
  if (draft.method === "pickup") return { method: "pickup" as const, contact }
  return {
    method: "delivery" as const,
    contact,
    address: {
      regionCode: draft.regionCode,
      provinceCode: draft.provinceCode,
      cityCode: draft.cityCode,
      barangayCode: draft.barangayCode,
      street: draft.street,
      zip: draft.zip,
    },
  }
}

// Step 1 is complete when the shared schema accepts it
export const isComplete = (draft: CheckoutDraft): boolean =>
  checkoutInputSchema.safeParse(draftPayload(draft)).success

// The address levels, top down
export const ADDRESS_LEVELS = [
  "regionCode",
  "provinceCode",
  "cityCode",
  "barangayCode",
] as const
export type AddressLevelKey = (typeof ADDRESS_LEVELS)[number]

// A level and every level below it, cleared (Behavior 12). Street and ZIP stay.
export function clearFrom(
  draft: CheckoutDraft,
  level: AddressLevelKey
): CheckoutDraft {
  const next = { ...draft }
  for (const key of ADDRESS_LEVELS.slice(ADDRESS_LEVELS.indexOf(level))) {
    next[key] = ""
  }
  return next
}
