import { describe, expect, test } from "vitest"

import { clampQuantity, getStockStatus, manilaToday } from "./stock"

const TODAY = "2026-10-26"

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
      expect(getStockStatus({ ...product, preorderShipsOn: null }, TODAY)).toBe(
        expected
      )
    }
  )

  test.each([
    {
      case: "a future ship date with stock is a pre-order",
      stock: 10,
      preorderShipsOn: "2027-01-15",
      expected: "pre-order",
    },
    {
      case: "a pre-order with stock at lowStockAt is still a pre-order",
      stock: 5,
      preorderShipsOn: "2027-01-15",
      expected: "pre-order",
    },
    {
      case: "tomorrow's ship date is a pre-order",
      stock: 10,
      preorderShipsOn: "2026-10-27",
      expected: "pre-order",
    },
    {
      case: "a pre-order without allocation left is out of stock",
      stock: 0,
      preorderShipsOn: "2027-01-15",
      expected: "out-of-stock",
    },
    {
      case: "a ship date of today ends the pre-order",
      stock: 10,
      preorderShipsOn: TODAY,
      expected: "in-stock",
    },
    {
      case: "a past ship date falls back to in stock",
      stock: 10,
      preorderShipsOn: "2026-01-15",
      expected: "in-stock",
    },
    {
      case: "a past ship date falls back to low stock",
      stock: 3,
      preorderShipsOn: "2026-01-15",
      expected: "low-stock",
    },
  ])("$case", ({ expected, stock, preorderShipsOn }) => {
    expect(
      getStockStatus({ stock, lowStockAt: 5, preorderShipsOn }, TODAY)
    ).toBe(expected)
  })
})

describe("manilaToday", () => {
  test("is already the next day at 23:30 UTC (UTC+8)", () => {
    expect(manilaToday(new Date("2026-10-26T23:30:00Z"))).toBe("2026-10-27")
  })

  test("is the same day at 15:59 UTC", () => {
    expect(manilaToday(new Date("2026-10-26T15:59:00Z"))).toBe("2026-10-26")
  })
})

describe("clampQuantity", () => {
  test.each([
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    [0, 1],
    [-3, 1],
    [1, 1],
    [4, 4],
    [10, 10],
    [11, 10],
    [2.7, 2],
  ])("clamps %d to %i with 10 available", (value, expected) => {
    expect(clampQuantity(value, 10)).toBe(expected)
  })
})
