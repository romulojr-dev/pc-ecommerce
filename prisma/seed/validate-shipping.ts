import { SHIPPING_ZONES } from "@/lib/shipping/zones"

import type { ShippingSeed } from "./data/shipping"

// Checks the shipping seed before anything is written (docs/specs/028-
// shipping-data-and-fee-rules, S8). The database refuses the same mistakes,
// but a seed that fails halfway is worse than one that stops at the door.
// Returns the problems; an empty list means the seed is valid.
export function validateShippingSeed(seed: ShippingSeed): string[] {
  const errors: string[] = []
  const fail = (message: string) => errors.push(`Shipping seed: ${message}`)

  const { store } = seed
  const threshold = store.freeShippingThreshold
  if (threshold !== null && !(Number.isInteger(threshold) && threshold > 0)) {
    fail(
      "the free-shipping threshold must be null or a whole number of centavos above 0."
    )
  }
  if (!(
    Number.isInteger(store.orderExpiryHours) && store.orderExpiryHours >= 1
  )) {
    fail("the order expiry must be a whole number of hours, 1 or more.")
  }
  for (const [label, value] of [
    ["address", store.storeAddress],
    ["hours", store.storeHours],
    ["info", store.storeInfo],
  ] as const) {
    if (value.trim() === "") fail(`the store ${label} is empty.`)
  }

  for (const zone of SHIPPING_ZONES) {
    // In the order the seed lists them: the limits must rise
    const tiers = seed.rates.filter((rate) => rate.zone === zone)
    if (tiers.length === 0) {
      fail(`${zone} has no tiers.`)
      continue
    }

    for (const { fee, maxWeightGrams } of tiers) {
      if (!(Number.isInteger(fee) && fee >= 0)) {
        fail(`${zone} fee must be a whole number of centavos, 0 or more.`)
      }
      if (
        maxWeightGrams !== null &&
        !(Number.isInteger(maxWeightGrams) && maxWeightGrams > 0)
      ) {
        fail(`${zone} weight limit must be a whole number of grams above 0.`)
      }
    }

    const bounded = tiers
      .map((rate) => rate.maxWeightGrams)
      .filter((limit): limit is number => limit !== null)
    for (let i = 1; i < bounded.length; i++) {
      if (!(bounded[i] > bounded[i - 1])) {
        fail(
          `${zone} tier limits must rise: ${bounded[i - 1]} then ${bounded[i]}.`
        )
      }
    }

    const openEnded = tiers.length - bounded.length
    if (openEnded === 0) fail(`${zone} is missing an open-ended tier.`)
    if (openEnded > 1) fail(`${zone} has two open-ended tiers.`)
  }

  return errors
}
