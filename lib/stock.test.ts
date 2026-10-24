import { describe, expect, test } from "vitest"

import { getStockStatus } from "./stock"

describe("getStockStatus", () => {
  test.each([
    { stock: 0, lowStockAt: 5, expected: "out-of-stock" },
    { stock: 1, lowStockAt: 5, expected: "low-stock" },
    { stock: 5, lowStockAt: 5, expected: "low-stock" },
    { stock: 6, lowStockAt: 5, expected: "in-stock" },
    { stock: 0, lowStockAt: 0, expected: "out-of-stock" },
    { stock: 1, lowStockAt: 0, expected: "in-stock" },
  ])(
    "stock $stock with lowStockAt $lowStockAt is $expected",
    ({ expected, ...product }) => {
      expect(getStockStatus(product)).toBe(expected)
    }
  )
})
