import { describe, expect, it } from "vitest"

import { categoryFilter } from "./category"
import { searchFilters } from "./index"
import type { FacetRow } from "./types"

// The parsing rules are shared with brand (slug-list.ts, covered in
// brand.test.ts); these check the category's own key, label and facet.

const options = [
  { value: "cpu", label: "CPU" },
  { value: "gpu", label: "Graphics Card" },
]

describe("categoryFilter", () => {
  it("reads repeated category slugs, once each, sorted", () => {
    expect(categoryFilter.parse({})).toBeNull()
    expect(
      categoryFilter.parse({ category: ["gpu", "cpu", "gpu", "BAD"] })
    ).toEqual(["cpu", "gpu"])
    expect(categoryFilter.parse({ brand: "cpu" })).toBeNull()
  })

  it("writes one category entry per slug", () => {
    expect(categoryFilter.serialize(["cpu", "gpu"])).toEqual([
      ["category", "cpu"],
      ["category", "gpu"],
    ])
  })

  it("has one chip per category, named after the option", () => {
    expect(categoryFilter.chips(["cpu", "gpu"], options)).toEqual([
      { label: "Category: CPU", without: ["gpu"] },
      { label: "Category: Graphics Card", without: ["cpu"] },
    ])
  })

  it("drops categories that aren't options", () => {
    expect(categoryFilter.normalize(["cpu", "nope"], options)).toEqual(["cpu"])
    expect(categoryFilter.normalize(["nope"], options)).toBeNull()
  })

  it("finds its options in the products' categories, by name", () => {
    const row = { category: { slug: "gpu", name: "Graphics Card" } }
    expect(categoryFilter.facet.values(row as FacetRow)).toEqual([
      { value: "gpu", label: "Graphics Card" },
    ])
    const sorted = [...options].reverse().sort(categoryFilter.facet.compare)
    expect(sorted.map((option) => option.label)).toEqual([
      "CPU",
      "Graphics Card",
    ])
  })
})

describe("searchFilters", () => {
  it("is Category, then the common filters, in URL order", () => {
    expect(searchFilters.map((filter) => filter.key)).toEqual([
      "category",
      "brand",
      "price",
      "inStock",
      "onSale",
    ])
  })
})
