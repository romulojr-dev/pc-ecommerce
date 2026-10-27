import { describe, expect, it } from "vitest"

import {
  clearFilters,
  isCanonicalQuery,
  type ListingState,
  listingHref,
  listingQuery,
  pageCount,
  PAGE_SIZE,
  paginationItems,
  parseListingParams,
  parseView,
  withFilter,
} from "@/lib/listing-params"

// A state with defaults, plus whatever the test cares about
function plain(overrides: Partial<ListingState> = {}): ListingState {
  return { sort: "newest", page: 1, filters: {}, ...overrides }
}

describe("parseListingParams", () => {
  it("reads valid values", () => {
    expect(
      parseListingParams("cpu", { sort: "price-desc", page: "3" })
    ).toEqual({
      sort: "price-desc",
      page: 3,
      filters: {},
    })
  })

  it("defaults to newest, page 1", () => {
    expect(parseListingParams("cpu", {})).toEqual({
      sort: "newest",
      page: 1,
      filters: {},
    })
  })

  it("falls back on an unknown sort", () => {
    expect(parseListingParams("cpu", { sort: "bogus" }).sort).toBe("newest")
  })

  it.each(["0", "-1", "2.5", "abc", "01", "", "99999999999999999999"])(
    "falls back to page 1 for %j",
    (page) => {
      expect(parseListingParams("cpu", { page }).page).toBe(1)
    }
  )

  it("uses the first value of a repeated key", () => {
    expect(
      parseListingParams("cpu", {
        sort: ["price-asc", "price-desc"],
        page: ["2", "5"],
      })
    ).toEqual({ sort: "price-asc", page: 2, filters: {} })
  })
})

describe("listingQuery and listingHref", () => {
  it("omits defaults", () => {
    expect(listingQuery("cpu", plain())).toBe("")
    expect(listingHref("cpu", plain())).toBe("/cpu")
  })

  it("writes keys in a fixed order", () => {
    expect(listingHref("gpu", plain({ sort: "price-asc", page: 2 }))).toBe(
      "/gpu?sort=price-asc&page=2"
    )
    expect(listingHref("gpu", plain({ page: 2 }))).toBe("/gpu?page=2")
  })

  it("round-trips with the parser", () => {
    const state = plain({ sort: "price-desc", page: 4 })
    const query = Object.fromEntries(
      new URLSearchParams(listingQuery("cpu", state))
    )
    expect(parseListingParams("cpu", query)).toEqual(state)
  })
})

describe("filters in the state", () => {
  const filtered: ListingState = {
    sort: "price-desc",
    page: 2,
    filters: {
      brand: ["amd", "intel"],
      price: { min: 10000, max: 20000 },
      inStock: true,
    },
  }
  const query =
    "brand=amd&brand=intel&minPrice=10000&maxPrice=20000&inStock=1&sort=price-desc&page=2"

  it("parses every filter next to sort and page", () => {
    expect(
      parseListingParams("cpu", {
        brand: ["amd", "intel"],
        minPrice: "10000",
        maxPrice: "20000",
        inStock: "1",
        sort: "price-desc",
        page: "2",
      })
    ).toEqual(filtered)
  })

  it("writes the filters first, then sort and page", () => {
    expect(listingQuery("cpu", filtered)).toBe(query)
    expect(listingHref("cpu", filtered)).toBe(`/cpu?${query}`)
  })

  it("writes only the active filters", () => {
    expect(
      listingQuery(
        "cpu",
        plain({ filters: { price: { min: null, max: 5000 } } })
      )
    ).toBe("maxPrice=5000")
  })

  it("round-trips with the parser (repeated keys as arrays)", () => {
    const params = new URLSearchParams(query)
    const raw: Record<string, string | string[]> = {}
    for (const key of new Set(params.keys())) {
      const values = params.getAll(key)
      raw[key] = values.length > 1 ? values : values[0]
    }
    expect(parseListingParams("cpu", raw)).toEqual(filtered)
  })

  it("ignores bad filter values and keeps the rest", () => {
    expect(
      parseListingParams("cpu", {
        brand: "NOT A SLUG",
        minPrice: "abc",
        maxPrice: "9000",
        inStock: "yes",
        sort: "price-asc",
      })
    ).toEqual(
      plain({
        sort: "price-asc",
        filters: { price: { min: null, max: 9000 } },
      })
    )
  })

  it("sets or removes a filter and goes back to page 1", () => {
    const removed = withFilter(filtered, "inStock", null)
    expect(removed.page).toBe(1)
    expect(removed.sort).toBe("price-desc")
    expect(removed.filters).toEqual({
      brand: ["amd", "intel"],
      price: { min: 10000, max: 20000 },
    })
    expect(withFilter(plain({ page: 3 }), "brand", ["amd"])).toEqual(
      plain({ filters: { brand: ["amd"] } })
    )
  })

  it("clears every filter, keeping the sort", () => {
    expect(clearFilters(filtered)).toEqual(plain({ sort: "price-desc" }))
  })
})

describe("isCanonicalQuery", () => {
  it("accepts the canonical query", () => {
    expect(isCanonicalQuery("cpu", {}, plain())).toBe(true)
    expect(
      isCanonicalQuery(
        "cpu",
        { sort: "price-asc", page: "2" },
        plain({ sort: "price-asc", page: 2 })
      )
    ).toBe(true)
    expect(
      isCanonicalQuery(
        "cpu",
        { brand: ["amd", "intel"], maxPrice: "20000", inStock: "1" },
        plain({
          filters: {
            brand: ["amd", "intel"],
            price: { min: null, max: 20000 },
            inStock: true,
          },
        })
      )
    ).toBe(true)
  })

  it("rejects bad values, spelled-out defaults, unknown and repeated keys", () => {
    const state = plain()
    expect(isCanonicalQuery("cpu", { sort: "bogus" }, state)).toBe(false)
    expect(isCanonicalQuery("cpu", { page: "1" }, state)).toBe(false)
    expect(isCanonicalQuery("cpu", { sort: "newest" }, state)).toBe(false)
    expect(isCanonicalQuery("cpu", { utm_source: "x" }, state)).toBe(false)
    expect(
      isCanonicalQuery("cpu", { page: ["2", "2"] }, plain({ page: 2 }))
    ).toBe(false)
  })

  it("rejects bad, repeated, unsorted and spelled-out filter values", () => {
    const amd = plain({ filters: { brand: ["amd"] } })
    expect(isCanonicalQuery("cpu", { brand: ["amd", "amd"] }, amd)).toBe(false)
    expect(isCanonicalQuery("cpu", { brand: ["amd", "BAD"] }, amd)).toBe(false)
    expect(isCanonicalQuery("cpu", { brand: "amd", inStock: "0" }, amd)).toBe(
      false
    )
    expect(
      isCanonicalQuery(
        "cpu",
        { brand: ["intel", "amd"] },
        plain({ filters: { brand: ["amd", "intel"] } })
      )
    ).toBe(false)
    expect(
      isCanonicalQuery(
        "cpu",
        { minPrice: "20000", maxPrice: "10000" },
        plain({ filters: { price: { min: 10000, max: 20000 } } })
      )
    ).toBe(false)
  })

  it("rejects keys in another order", () => {
    expect(
      isCanonicalQuery(
        "cpu",
        { page: "2", sort: "price-asc" },
        plain({ sort: "price-asc", page: 2 })
      )
    ).toBe(false)
    expect(
      isCanonicalQuery(
        "cpu",
        { sort: "price-asc", inStock: "1" },
        plain({ sort: "price-asc", filters: { inStock: true } })
      )
    ).toBe(false)
  })
})

describe("pageCount", () => {
  it("has at least one page", () => {
    expect(pageCount(0)).toBe(1)
    expect(pageCount(PAGE_SIZE)).toBe(1)
    expect(pageCount(PAGE_SIZE + 1)).toBe(2)
  })
})

describe("paginationItems", () => {
  it("lists every page up to 7", () => {
    expect(paginationItems(1, 1)).toEqual([1])
    expect(paginationItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it("keeps 7 items near the start, middle and end", () => {
    expect(paginationItems(2, 20)).toEqual([1, 2, 3, 4, 5, "ellipsis", 20])
    expect(paginationItems(10, 20)).toEqual([
      1,
      "ellipsis",
      9,
      10,
      11,
      "ellipsis",
      20,
    ])
    expect(paginationItems(19, 20)).toEqual([1, "ellipsis", 16, 17, 18, 19, 20])
  })
})

describe("parseView", () => {
  it("defaults to grid", () => {
    expect(parseView("list")).toBe("list")
    expect(parseView("grid")).toBe("grid")
    expect(parseView(undefined)).toBe("grid")
    expect(parseView("tiles")).toBe("grid")
  })
})
