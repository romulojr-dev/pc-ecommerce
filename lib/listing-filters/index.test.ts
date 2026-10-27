import { describe, expect, it } from "vitest"

import {
  activeFilterChips,
  activeFilterCount,
  commonFilters,
  type FilterList,
  type FilterOptions,
  normalizeFilters,
  parseFilters,
  serializeFilters,
  setFilter,
} from "./index"

const common: FilterList = Object.values(commonFilters)

const options: FilterOptions = {
  brand: [
    { value: "amd", label: "AMD" },
    { value: "intel", label: "Intel" },
  ],
}

describe("commonFilters", () => {
  it("names each filter by its key", () => {
    for (const [key, filter] of Object.entries(commonFilters)) {
      expect(filter.key).toBe(key)
    }
  })

  it("lists the filters in URL order", () => {
    expect(Object.keys(commonFilters)).toEqual([
      "brand",
      "price",
      "inStock",
      "onSale",
    ])
  })
})

describe("parseFilters and serializeFilters", () => {
  it("parse nothing from an empty query, and write nothing for it", () => {
    expect(parseFilters({}, common)).toEqual({})
    expect(serializeFilters({}, common)).toEqual([])
  })

  it("write in filter order whatever the order they were given", () => {
    const filters = parseFilters(
      {
        inStock: "1",
        maxPrice: "500",
        brand: ["intel", "amd"],
      },
      common
    )
    expect(filters).toEqual({
      brand: ["amd", "intel"],
      price: { min: null, max: 500 },
      inStock: true,
    })
    expect(serializeFilters(filters, common)).toEqual([
      ["brand", "amd"],
      ["brand", "intel"],
      ["maxPrice", "500"],
      ["inStock", "1"],
    ])
  })
})

describe("normalizeFilters", () => {
  it("drops brands that aren't options and keeps the other filters", () => {
    expect(
      normalizeFilters(
        { brand: ["amd", "nope"], price: { min: 1, max: null }, inStock: true },
        options,
        common
      )
    ).toEqual({
      brand: ["amd"],
      price: { min: 1, max: null },
      inStock: true,
    })
  })

  it("removes the filter when nothing is left", () => {
    expect(normalizeFilters({ brand: ["nope"] }, options, common)).toEqual({})
  })

  it("leaves filters without a normalize step, or without options, alone", () => {
    const filters = { brand: ["nope"], inStock: true } as const
    expect(
      normalizeFilters({ ...filters, brand: [...filters.brand] }, {}, common)
    ).toEqual(filters)
  })
})

describe("setFilter", () => {
  it("sets and removes a filter without changing the original", () => {
    const original = { brand: ["amd"] }
    expect(setFilter(original, "inStock", true)).toEqual({
      brand: ["amd"],
      inStock: true,
    })
    expect(setFilter(original, "brand", null)).toEqual({})
    expect(original).toEqual({ brand: ["amd"] })
  })
})

describe("activeFilterCount", () => {
  it("counts filters, not their values", () => {
    expect(activeFilterCount({})).toBe(0)
    expect(activeFilterCount({ brand: ["amd", "intel"], inStock: true })).toBe(
      2
    )
  })
})

describe("activeFilterChips", () => {
  const filters = {
    brand: ["amd", "intel"],
    price: { min: 1000, max: 2000 },
    inStock: true,
  } as const

  it("has a chip per brand, one for the price and one for stock", () => {
    const chips = activeFilterChips(
      { ...filters, brand: [...filters.brand] },
      options,
      common
    )
    expect(chips.map(({ key, label }) => [key, label])).toEqual([
      ["brand", "Brand: AMD"],
      ["brand", "Brand: Intel"],
      ["price", "Price: ₱1,000 – ₱2,000"],
      ["inStock", "In stock only"],
    ])
  })

  it("gives the filters as they are once a chip is removed", () => {
    const chips = activeFilterChips(
      { ...filters, brand: [...filters.brand] },
      options,
      common
    )
    const byLabel = (label: string) =>
      chips.find((chip) => chip.label === label)!.filters

    expect(byLabel("Brand: AMD")).toEqual({
      brand: ["intel"],
      price: { min: 1000, max: 2000 },
      inStock: true,
    })
    expect(byLabel("Price: ₱1,000 – ₱2,000")).toEqual({
      brand: ["amd", "intel"],
      inStock: true,
    })
    expect(byLabel("In stock only")).toEqual({
      brand: ["amd", "intel"],
      price: { min: 1000, max: 2000 },
    })
  })

  it("has no chips without filters", () => {
    expect(activeFilterChips({}, options, common)).toEqual([])
  })
})
