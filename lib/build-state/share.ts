import { type BuildItem, parseBuild, SLOTS, type Slot } from "@/lib/builder"

import { MAX_BUILD_PRODUCTS } from "./parts"

// What the share action accepts (docs/specs/022-share-build, Rules ›
// Validating what the server receives). Pure, so it is shared by the server
// and its unit tests; the database checks come after it (lib/build-share.ts).

// The most of one part a shared build holds. Spec 018 sets no limit for the
// engine and the store still doesn't; the share needs one because rows come
// from anyone and the database column is a finite Int.
export const MAX_SHARE_QUANTITY = 99

// Why a share failed. `unavailable` and `error` come from the database
// steps, the rest from shareInput.
export type ShareFailure =
  | {
      ok: false
      reason: "empty" | "invalid" | "too-many-parts" | "unavailable" | "error"
    }
  | {
      ok: false
      reason: "quantity-too-high"
      slot: Slot
      productId: string
      max: number
    }

export type ShareResult = { ok: true; slug: string } | ShareFailure

export type ShareInputResult =
  | { ok: true; items: BuildItem[] }
  | Exclude<ShareFailure, { reason: "unavailable" | "error" }>

// In order: a list, at most MAX_BUILD_PRODUCTS items (a canonical build has
// one item per product, so this is the same as 20 different products), not
// empty, nothing for parseBuild to repair, quantities up to 99. Anything
// parseBuild would repair is rejected, so a link never shows a different
// build from the one the shopper's browser holds (D5). Any other property of
// an item is dropped.
export function shareInput(input: unknown): ShareInputResult {
  if (!Array.isArray(input)) return { ok: false, reason: "invalid" }
  if (input.length > MAX_BUILD_PRODUCTS) {
    return { ok: false, reason: "too-many-parts" }
  }
  if (input.length === 0) return { ok: false, reason: "empty" }

  const { items, changes } = parseBuild(input)
  if (changes.length > 0) return { ok: false, reason: "invalid" }

  for (const slot of SLOTS) {
    const tooHigh = items.find(
      (item) => item.slot === slot && item.quantity > MAX_SHARE_QUANTITY
    )
    if (tooHigh) {
      return {
        ok: false,
        reason: "quantity-too-high",
        slot,
        productId: tooHigh.productId,
        max: MAX_SHARE_QUANTITY,
      }
    }
  }
  return { ok: true, items }
}
