import { describe, expect, it } from "vitest"

import { MAX_PRICE_PESOS, priceFilter } from "./price"

describe("priceFilter.parse", () => {
  it("is inactive without a price", () => {
    expect(priceFilter.parse({})).toBeNull()
  })

  it("reads a range, or either bound alone", () => {
    expect(priceFilter.parse({ minPrice: "10000", maxPrice: "20000" })).toEqual(
      {
        min: 10000,
        max: 20000,
      }
    )
    expect(priceFilter.parse({ minPrice: "10000" })).toEqual({
      min: 10000,
      max: null,
    })
    expect(priceFilter.parse({ maxPrice: "20000" })).toEqual({
      min: null,
      max: 20000,
    })
  })

  it("accepts an exact price (min equal to max)", () => {
    expect(priceFilter.parse({ minPrice: "15000", maxPrice: "15000" })).toEqual(
      { min: 15000, max: 15000 }
    )
  })

  it("swaps bounds that are the wrong way round", () => {
    expect(priceFilter.parse({ minPrice: "20000", maxPrice: "10000" })).toEqual(
      {
        min: 10000,
        max: 20000,
      }
    )
  })

  it.each([
    "abc",
    "",
    "-5",
    "1.5",
    "1e3",
    "1,000",
    " 100",
    "007",
    "+5",
    "123456789",
    String(MAX_PRICE_PESOS + 1),
    "99999999999999999999",
  ])("ignores %j", (value) => {
    expect(priceFilter.parse({ minPrice: value })).toBeNull()
    expect(priceFilter.parse({ maxPrice: value })).toBeNull()
  })

  it("accepts the largest allowed price", () => {
    expect(priceFilter.parse({ maxPrice: String(MAX_PRICE_PESOS) })).toEqual({
      min: null,
      max: MAX_PRICE_PESOS,
    })
  })

  it("ignores a bad bound but keeps the other", () => {
    expect(priceFilter.parse({ minPrice: "abc", maxPrice: "9000" })).toEqual({
      min: null,
      max: 9000,
    })
    expect(priceFilter.parse({ minPrice: "5000", maxPrice: "-1" })).toEqual({
      min: 5000,
      max: null,
    })
  })

  it("treats a minimum of 0 as no minimum, but a maximum of 0 as a limit", () => {
    expect(priceFilter.parse({ minPrice: "0" })).toBeNull()
    expect(priceFilter.parse({ minPrice: "0", maxPrice: "500" })).toEqual({
      min: null,
      max: 500,
    })
    expect(priceFilter.parse({ maxPrice: "0" })).toEqual({ min: null, max: 0 })
  })

  it("uses the first value of a repeated key", () => {
    expect(priceFilter.parse({ minPrice: ["100", "999"] })).toEqual({
      min: 100,
      max: null,
    })
  })
})

describe("priceFilter.serialize", () => {
  it("writes only the bounds that are set, min first", () => {
    expect(priceFilter.serialize({ min: 1000, max: 2000 })).toEqual([
      ["minPrice", "1000"],
      ["maxPrice", "2000"],
    ])
    expect(priceFilter.serialize({ min: null, max: 2000 })).toEqual([
      ["maxPrice", "2000"],
    ])
    expect(priceFilter.serialize({ min: 1000, max: null })).toEqual([
      ["minPrice", "1000"],
    ])
  })
})

describe("priceFilter.chips", () => {
  it("is one chip that clears the whole range", () => {
    expect(priceFilter.chips({ min: 10000, max: 20000 })).toEqual([
      { label: "Price: ₱10,000 – ₱20,000", without: null },
    ])
  })

  it.each([
    [{ min: 10000, max: null }, "Price: from ₱10,000"],
    [{ min: null, max: 20000 }, "Price: up to ₱20,000"],
    [{ min: 15000, max: 15000 }, "Price: ₱15,000"],
    [{ min: null, max: 0 }, "Price: up to ₱0"],
  ])("labels %j as %s", (value, label) => {
    expect(priceFilter.chips(value)[0].label).toBe(label)
  })
})
