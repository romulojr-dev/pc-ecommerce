import type { Issue } from "@/lib/builder"
import type { CartView } from "@/lib/cart/types"
import { MIN_ONLINE_TOTAL } from "@/lib/payments/amount"
import type { ShippingConfig } from "@/lib/shipping/config"
import { type ShippingFeeResult, shippingFee } from "@/lib/shipping/fee"
import { orderWeightGrams, type WeightLine } from "@/lib/shipping/weight"
import type { ShippingZone } from "@/lib/shipping/zones"
import {
  checkVoucher,
  type VoucherInput,
  type VoucherRefusal,
} from "@/lib/vouchers"

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

// What the shopper asked for, as the review reads it (docs/specs/037-vouchers-
// at-checkout). `voucher` is the row the typed code matched, or null when none
// did; `now` is the one clock the check uses.
export type VoucherRequest =
  | { requested: false }
  | {
      requested: true
      voucher: (VoucherInput & { id: string; code: string }) | null
      now: Date
    }

// What became of the code: none was asked for, it is applied (the stored
// code and what it takes off), or it is refused for a reason
export type VoucherOutcome =
  | { kind: "none" }
  | { kind: "applied"; code: string; discount: number }
  | { kind: "refused"; refusal: VoucherRefusal }

export type CheckoutReview = {
  method: "delivery" | "pickup"
  // The cart's entries as /cart shows them, read-only
  view: CartView
  // Centavos: the /cart subtotal (single lines still sold plus group totals)
  subtotal: number
  // Grams of the same lines
  weightGrams: number
  shipping: ShippingFeeResult
  // Centavos off the subtotal; 0 with no voucher or a refused one
  discount: number
  voucher: VoucherOutcome
  // subtotal - discount + shipping; null when delivery isn't available
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

// The voucher's part of the review (docs/specs/037-vouchers-at-checkout,
// Behavior 8, 10, 13). The check and the discount come from the pure
// `checkVoucher`; an applied code whose total would fall under what the
// gateway takes is refused whole, as a second pass. The fee does not depend on
// the voucher, so it is worked out first, from the subtotal before the
// discount (spec 028 D14).
function voucherOutcome(
  request: VoucherRequest,
  subtotal: number,
  shipping: ShippingFeeResult
): VoucherOutcome {
  if (!request.requested) return { kind: "none" }
  const checked = checkVoucher(request.voucher, subtotal, request.now)
  if (!checked.ok) {
    return {
      kind: "refused",
      refusal:
        checked.reason === "min-spend"
          ? { reason: "min-spend", shortBy: checked.shortBy }
          : { reason: checked.reason },
    }
  }
  if (
    shipping.ok &&
    subtotal - checked.discount + shipping.fee < MIN_ONLINE_TOTAL
  ) {
    return { kind: "refused", refusal: { reason: "below-minimum" } }
  }
  return {
    kind: "applied",
    code: request.voucher!.code,
    discount: checked.discount,
  }
}

export function buildReview(
  view: CartView,
  weights: ReadonlyMap<string, number>,
  destination: ReviewDestination,
  config: ShippingConfig,
  request: VoucherRequest = { requested: false }
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

  const voucher = voucherOutcome(request, subtotal, shipping)
  const discount = voucher.kind === "applied" ? voucher.discount : 0

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
    discount,
    voucher,
    total: shipping.ok ? subtotal - discount + shipping.fee : null,
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
