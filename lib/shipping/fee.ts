import type { ShippingZone } from "./zones"

// The shipping fee (docs/specs/028-shipping-data-and-fee-rules, Behavior
// 13–15; FR-16). Pure, whole centavos, no database.

export type ShippingMethod = "delivery" | "pickup"

// One row of the rate table; maxWeightGrams null is the zone's open-ended tier
export type ShippingRateTier = {
  zone: ShippingZone
  maxWeightGrams: number | null
  fee: number
}

export type ShippingFeeInput = {
  method: ShippingMethod
  zone: ShippingZone
  weightGrams: number
  // The merchandise total at the prices paid, before any voucher (D14)
  subtotal: number
}

// freeShippingThreshold null means free shipping is off. Whether pickup is
// offered is the checkout's decision, not read here (D15).
export type ShippingFeeSettings = { freeShippingThreshold: number | null }

export type ShippingFeeResult =
  | { ok: true; fee: number; basis: "pickup" | "free-shipping" | "rate" }
  | { ok: false; reason: "no-rate" }

const isCentavos = (value: number) => Number.isInteger(value) && value >= 0

// In this order: pickup is free; a zone with no tier for this weight can't be
// delivered to (D7); a subtotal at or above the threshold is free (equal is
// free); otherwise the smallest tier whose limit is at least the weight, or
// the open-ended tier above every bounded one. The order of `rates` doesn't
// matter. Input that is not whole numbers, or a rate table with two
// open-ended tiers or a repeated limit in one zone, is a bug and throws.
export function shippingFee(
  input: ShippingFeeInput,
  rates: readonly ShippingRateTier[],
  settings: ShippingFeeSettings
): ShippingFeeResult {
  const { method, zone, weightGrams, subtotal } = input
  if (!isCentavos(weightGrams)) {
    throw new RangeError(`Invalid weight: ${weightGrams}`)
  }
  if (!isCentavos(subtotal)) {
    throw new RangeError(`Invalid subtotal: ${subtotal}`)
  }
  const { freeShippingThreshold: threshold } = settings
  if (threshold !== null && !(Number.isInteger(threshold) && threshold > 0)) {
    throw new RangeError(`Invalid free-shipping threshold: ${threshold}`)
  }

  const seen = new Set<string>()
  for (const rate of rates) {
    const { maxWeightGrams, fee } = rate
    if (!isCentavos(fee)) throw new RangeError(`Invalid fee: ${fee}`)
    if (
      maxWeightGrams !== null &&
      !(Number.isInteger(maxWeightGrams) && maxWeightGrams > 0)
    ) {
      throw new RangeError(`Invalid weight limit: ${maxWeightGrams}`)
    }
    const key = `${rate.zone}/${maxWeightGrams}`
    if (seen.has(key)) {
      throw new RangeError(
        `Two tiers for ${rate.zone} with limit ${maxWeightGrams}`
      )
    }
    seen.add(key)
  }

  if (method === "pickup") return { ok: true, fee: 0, basis: "pickup" }

  const tiers = rates.filter((rate) => rate.zone === zone)
  const bounded = tiers
    .filter((rate) => rate.maxWeightGrams !== null)
    .sort((a, b) => a.maxWeightGrams! - b.maxWeightGrams!)
  const tier =
    bounded.find((rate) => rate.maxWeightGrams! >= weightGrams) ??
    tiers.find((rate) => rate.maxWeightGrams === null)
  if (!tier) return { ok: false, reason: "no-rate" }

  if (threshold !== null && subtotal >= threshold) {
    return { ok: true, fee: 0, basis: "free-shipping" }
  }
  return { ok: true, fee: tier.fee, basis: "rate" }
}
