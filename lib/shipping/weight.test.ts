import { describe, expect, it } from "vitest"

import {
  buildAProducts,
  lancool216,
  ryzen5_7600,
} from "@/test-support/seed-products"

import { orderWeightGrams } from "./weight"

// docs/specs/028-shipping-data-and-fee-rules, W1–W6
const line = (product: { weightGrams: number }, quantity = 1) => ({
  weightGrams: product.weightGrams,
  quantity,
})

describe("orderWeightGrams", () => {
  it("W1: an empty order weighs 0", () => {
    expect(orderWeightGrams([])).toBe(0)
  })

  it("W2: Ryzen 5 7600 × 2 (450 g each) is 900 g", () => {
    expect(ryzen5_7600().weightGrams).toBe(450)
    expect(orderWeightGrams([line(ryzen5_7600(), 2)])).toBe(900)
  })

  it("W3: the eight parts of Build A, a build group, are 15,860 g", () => {
    expect(orderWeightGrams(buildAProducts().map((p) => line(p)))).toBe(15_860)
  })

  it("W4: a single line plus a build group adds up", () => {
    expect(
      orderWeightGrams([
        line(ryzen5_7600(), 2),
        ...buildAProducts().map((p) => line(p)),
      ])
    ).toBe(16_760)
  })

  it("W5: the same product in a single line and in a group counts on both", () => {
    expect(
      orderWeightGrams([
        line(ryzen5_7600()),
        ...buildAProducts().map((p) => line(p)),
      ])
    ).toBe(16_310)
  })

  it("multiplies by quantity: LANCOOL 216 × 3 is 27,000 g", () => {
    expect(orderWeightGrams([line(lancool216(), 3)])).toBe(27_000)
  })

  it.each([
    ["a fractional weight", { weightGrams: 450.5, quantity: 1 }],
    ["a negative weight", { weightGrams: -1, quantity: 1 }],
    ["quantity 0", { weightGrams: 450, quantity: 0 }],
    ["a negative quantity", { weightGrams: 450, quantity: -1 }],
    ["a fractional quantity", { weightGrams: 450, quantity: 1.5 }],
    ["NaN", { weightGrams: Number.NaN, quantity: 1 }],
  ])("W6: throws for %s (a caller bug)", (_name, bad) => {
    expect(() => orderWeightGrams([line(ryzen5_7600()), bad])).toThrow(
      RangeError
    )
  })
})
