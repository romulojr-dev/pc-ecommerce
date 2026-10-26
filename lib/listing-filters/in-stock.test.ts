import { describe, expect, it } from "vitest"

import { inStockFilter } from "./in-stock"

describe("inStockFilter", () => {
  it("is on only for 1", () => {
    expect(inStockFilter.parse({ inStock: "1" })).toBe(true)
    expect(inStockFilter.parse({ inStock: ["1", "0"] })).toBe(true)
  })

  it.each(["0", "true", "yes", "on", "", "01", " 1"])(
    "is off for %j",
    (value) => {
      expect(inStockFilter.parse({ inStock: value })).toBeNull()
    }
  )

  it("is off when missing", () => {
    expect(inStockFilter.parse({})).toBeNull()
    expect(inStockFilter.parse({ inStock: ["0", "1"] })).toBeNull()
  })

  it("writes inStock=1", () => {
    expect(inStockFilter.serialize()).toEqual([["inStock", "1"]])
  })

  it("has one chip that turns it off", () => {
    expect(inStockFilter.chips()).toEqual([
      { label: "In stock only", without: null },
    ])
  })
})
