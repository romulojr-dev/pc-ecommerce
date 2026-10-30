// The weight of an order (docs/specs/028-shipping-data-and-fee-rules,
// Behavior 12). Pure.

export type WeightLine = { weightGrams: number; quantity: number }

// The sum of weightGrams × quantity over the lines. The caller passes every
// purchasable cart line: single items and each part of a build group (a group
// is just its cart lines). A product in a single line and in a group counts
// on both. A weight or quantity that isn't a whole number, or a quantity
// below 1, is a bug in the caller and throws.
export function orderWeightGrams(lines: readonly WeightLine[]): number {
  let total = 0
  for (const { weightGrams, quantity } of lines) {
    if (!Number.isInteger(weightGrams) || weightGrams < 0) {
      throw new RangeError(`Invalid weight: ${weightGrams}`)
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new RangeError(`Invalid quantity: ${quantity}`)
    }
    total += weightGrams * quantity
  }
  return total
}
