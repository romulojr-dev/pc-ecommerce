import { describe, expect, test } from "vitest"

import {
  discountPercent,
  formatDate,
  formatPeso,
  formatWarranty,
} from "./format"

describe("formatPeso", () => {
  test.each([
    [0, "₱0.00"],
    [99, "₱0.99"],
    [1149500, "₱11,495.00"],
    [123456789, "₱1,234,567.89"],
    [-50000, "-₱500.00"],
  ])("formats %i centavos as %s", (centavos, expected) => {
    expect(formatPeso(centavos)).toBe(expected)
  })

  test.each([1.5, -1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects %d, which is not integer centavos",
    (centavos) => {
      expect(() => formatPeso(centavos)).toThrow(RangeError)
    }
  )
})

describe("discountPercent", () => {
  test.each([
    [1149500, 999900, 13], // 13.01 %
    [1549500, 1399500, 9], // 9.68 %: rounded down, not to 10
    [100000, 50000, 50],
    [2999500, 2999000, 0], // under 1 %
  ])("%i -> %i is %i%% off", (price, salePrice, expected) => {
    expect(discountPercent(price, salePrice)).toBe(expected)
  })
})

describe("formatWarranty", () => {
  test.each([
    [0, "No manufacturer warranty"],
    [6, "6-month warranty"],
    [12, "1-year warranty"],
    [18, "18-month warranty"],
    [24, "2-year warranty"],
    [36, "3-year warranty"],
  ])("formats %i months as %s", (months, expected) => {
    expect(formatWarranty(months)).toBe(expected)
  })
})

describe("formatDate", () => {
  test.each([
    ["2027-01-15", "January 15, 2027"],
    ["2026-12-31", "December 31, 2026"],
  ])("formats %s as %s", (isoDate, expected) => {
    expect(formatDate(isoDate)).toBe(expected)
  })
})
