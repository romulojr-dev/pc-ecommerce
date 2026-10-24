import { describe, expect, test } from "vitest"

import { formatPeso } from "./format"

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
