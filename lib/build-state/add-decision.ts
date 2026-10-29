import type { Issue, Slot } from "@/lib/builder"

import type { Fit } from "./fit"
import type { AddPlan } from "./plan-add"
import { SLOT_COPY } from "./slots"

// What Add to build does on the product page once it knows how the part sits
// in the saved build (docs/specs/024-add-anyway-product-page). Pure, so the
// browser and the tests run the same code.

// How far the build's parts have loaded (the same words as `PartsStatus`)
export type LoadStatus = "loading" | "ready" | "error"

export type AddDecision =
  // The parts are still loading: hold the click until they have
  | { kind: "wait" }
  // The part doesn't fit and the add would change the build: confirm first.
  // `replaces` is set when it also replaces a part (with the quantity it
  // keeps), so one dialog covers both.
  | { kind: "ask"; errors: Issue[]; replaces: { quantity: number } | null }
  // Spec 020's table as it is: add, raise, replace after its own dialog, or
  // nothing changes
  | { kind: "apply" }

// `fit` is the page's own verdict (spec 023), so the dialog and the hint can't
// disagree. A part already in the build is `in-build`, and a change that does
// nothing ("already", "at-stock", "full") or only raises a quantity never
// asks (D4, D6). A failed load has no verdict and adds, like no hint at all.
export function decideAdd({
  status,
  fit,
  plan,
}: {
  status: LoadStatus
  fit: Fit | null
  plan: AddPlan
}): AddDecision {
  if (status === "loading") return { kind: "wait" }
  if (fit?.kind !== "errors") return { kind: "apply" }
  if (plan.kind !== "add" && plan.kind !== "confirm-replace") {
    return { kind: "apply" }
  }
  return {
    kind: "ask",
    // Warnings never ask, and aren't listed (the picker does the same)
    errors: fit.issues.filter((issue) => issue.severity === "error"),
    replaces:
      plan.kind === "confirm-replace" ? { quantity: plan.quantity } : null,
  }
}

// The sentence the confirmation adds when the part also replaces another
export function replaceNote(slot: Slot, quantity: number): string {
  const kept =
    slot === "memory" && quantity > 1 ? `, keeping ${quantity} kits` : ""
  return `This also replaces the ${SLOT_COPY[slot].noun} you picked${kept}.`
}
