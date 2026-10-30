import type { Issue } from "@/lib/builder"
import type { CartView } from "@/lib/cart/types"
import type { ShippingConfig } from "@/lib/shipping/config"
import { type ShippingFeeResult, shippingFee } from "@/lib/shipping/fee"
import { orderWeightGrams, type WeightLine } from "@/lib/shipping/weight"
import type { ShippingZone } from "@/lib/shipping/zones"

import { cartProblems, type ReviewProblem } from "./problems"

// The review of step 2 (docs/specs/029-checkout-steps, Behavior 19–27). Pure:
// the server reads the cart, the weights, the address and the shipping
// config, and this puts them together. Nothing is stored.

// Where the order goes, as far as the fee is concerned
export type ReviewDestination =
  | { method: "pickup" }
  | { method: "delivery"; zone: ShippingZone; regionName: string }

// A group's warnings, listed with no new acknowledgment (Behavior 21)
export type GroupWarnings = {
  buildId: string
  number: number | null
  issues: Issue[]
}

export type CheckoutReview = {
  method: "delivery" | "pickup"
  // The cart's entries as /cart shows them, read-only
  view: CartView
  // Centavos: the /cart subtotal (single lines still sold plus group totals)
  subtotal: number
  // Grams of the same lines
  weightGrams: number
  shipping: ShippingFeeResult
  // subtotal + shipping; null when delivery isn't available
  total: number | null
  // The free-shipping threshold, when a delivery order hasn't reached it
  threshold: number | null
  problems: ReviewProblem[]
  warnings: GroupWarnings[]
  // Nothing blocks the order (it still can't be placed until #78)
  canPlace: boolean
}

// The weight of what the subtotal counts: single lines still sold and the
// parts of each group that are still sold (D12). A part with no weight in
// `weights` is a bug in the caller.
function weightLines(
  view: CartView,
  weights: ReadonlyMap<string, number>
): WeightLine[] {
  const weightOf = (productId: string) => {
    const weight = weights.get(productId)
    if (weight === undefined) throw new Error(`No weight for ${productId}`)
    return weight
  }
  const lines: WeightLine[] = []
  for (const entry of view.entries) {
    if (entry.kind === "single") {
      if (entry.sold) {
        lines.push({
          weightGrams: weightOf(entry.productId),
          quantity: entry.quantity,
        })
      }
      continue
    }
    for (const { rows } of entry.slots) {
      for (const row of rows) {
        if (row.kind !== "part") continue
        lines.push({
          weightGrams: weightOf(row.data.part.id),
          quantity: row.quantity,
        })
      }
    }
  }
  return lines
}

export function buildReview(
  view: CartView,
  weights: ReadonlyMap<string, number>,
  destination: ReviewDestination,
  config: ShippingConfig
): CheckoutReview {
  const subtotal = view.subtotal
  const weightGrams = orderWeightGrams(weightLines(view, weights))
  const shipping = shippingFee(
    {
      method: destination.method,
      zone: destination.method === "delivery" ? destination.zone : "luzon",
      weightGrams,
      subtotal,
    },
    config.rates,
    config.settings
  )

  const problems = cartProblems(view)
  if (!shipping.ok && destination.method === "delivery") {
    problems.push({ kind: "no-rate", region: destination.regionName })
  }

  const { freeShippingThreshold } = config.settings
  const warnings = view.entries.flatMap((entry): GroupWarnings[] => {
    if (entry.kind !== "build") return []
    const issues = entry.issues.filter((issue) => issue.severity === "warning")
    return issues.length > 0
      ? [{ buildId: entry.buildId, number: entry.number, issues }]
      : []
  })

  return {
    method: destination.method,
    view,
    subtotal,
    weightGrams,
    shipping,
    total: shipping.ok ? subtotal + shipping.fee : null,
    threshold:
      destination.method === "delivery" &&
      shipping.ok &&
      shipping.basis === "rate" &&
      freeShippingThreshold !== null
        ? freeShippingThreshold
        : null,
    problems,
    warnings,
    canPlace: problems.length === 0,
  }
}
