import { describe, expect, it } from "vitest"

import {
  categoryTarget,
  cleanQuery,
  clearFilters,
  defaultSort,
  isCanonicalQuery,
  type ListingState,
  listingHref,
  listingQuery,
  pageCount,
  PAGE_SIZE,
  paginationItems,
  parseListingParams,
  parseView,
  searchHref,
  searchTarget,
  sortsFor,
  withFilter,
} from "@/lib/listing-params"

// A state with defaults, plus whatever the test cares about
function plain(overrides: Partial<ListingState> = {}): ListingState {
  return { sort: "newest", page: 1, filters: {}, ...overrides }
}

describe("parseListingParams", () => {
  it("reads valid values", () => {
    expect(
      parseListingParams(categoryTarget("cpu"), {
        sort: "price-desc",
        page: "3",
      })
    ).toEqual({
      sort: "price-desc",
      page: 3,
      filters: {},
    })
  })

  it("defaults to newest, page 1", () => {
    expect(parseListingParams(categoryTarget("cpu"), {})).toEqual({
      sort: "newest",
      page: 1,
      filters: {},
    })
  })

  it("falls back on an unknown sort", () => {
    expect(
      parseListingParams(categoryTarget("cpu"), { sort: "bogus" }).sort
    ).toBe("newest")
  })

  it.each(["0", "-1", "2.5", "abc", "01", "", "99999999999999999999"])(
    "falls back to page 1 for %j",
    (page) => {
      expect(parseListingParams(categoryTarget("cpu"), { page }).page).toBe(1)
    }
  )

  it("uses the first value of a repeated key", () => {
    expect(
      parseListingParams(categoryTarget("cpu"), {
        sort: ["price-asc", "price-desc"],
        page: ["2", "5"],
      })
    ).toEqual({ sort: "price-asc", page: 2, filters: {} })
  })
})

describe("listingQuery and listingHref", () => {
  it("omits defaults", () => {
    expect(listingQuery(categoryTarget("cpu"), plain())).toBe("")
    expect(listingHref(categoryTarget("cpu"), plain())).toBe("/cpu")
  })

  it("writes keys in a fixed order", () => {
    expect(
      listingHref(categoryTarget("gpu"), plain({ sort: "price-asc", page: 2 }))
    ).toBe("/gpu?sort=price-asc&page=2")
    expect(listingHref(categoryTarget("gpu"), plain({ page: 2 }))).toBe(
      "/gpu?page=2"
    )
  })

  it("round-trips with the parser", () => {
    const state = plain({ sort: "price-desc", page: 4 })
    const query = Object.fromEntries(
      new URLSearchParams(listingQuery(categoryTarget("cpu"), state))
    )
    expect(parseListingParams(categoryTarget("cpu"), query)).toEqual(state)
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
      onSale: true,
    },
  }
  const query =
    "brand=amd&brand=intel&minPrice=10000&maxPrice=20000&inStock=1&onSale=1&sort=price-desc&page=2"

  it("parses every filter next to sort and page", () => {
    expect(
      parseListingParams(categoryTarget("cpu"), {
        brand: ["amd", "intel"],
        minPrice: "10000",
        maxPrice: "20000",
        inStock: "1",
        onSale: "1",
        sort: "price-desc",
        page: "2",
      })
    ).toEqual(filtered)
  })

  it("writes the filters first, then sort and page", () => {
    expect(listingQuery(categoryTarget("cpu"), filtered)).toBe(query)
    expect(listingHref(categoryTarget("cpu"), filtered)).toBe(`/cpu?${query}`)
  })

  it("writes only the active filters", () => {
    expect(
      listingQuery(
        categoryTarget("cpu"),
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
    expect(parseListingParams(categoryTarget("cpu"), raw)).toEqual(filtered)
  })

  it("ignores bad filter values and keeps the rest", () => {
    expect(
      parseListingParams(categoryTarget("cpu"), {
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
      onSale: true,
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
    expect(isCanonicalQuery(categoryTarget("cpu"), {}, plain())).toBe(true)
    expect(
      isCanonicalQuery(
        categoryTarget("cpu"),
        { sort: "price-asc", page: "2" },
        plain({ sort: "price-asc", page: 2 })
      )
    ).toBe(true)
    expect(
      isCanonicalQuery(
        categoryTarget("cpu"),
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
    expect(
      isCanonicalQuery(categoryTarget("cpu"), { sort: "bogus" }, state)
    ).toBe(false)
    expect(isCanonicalQuery(categoryTarget("cpu"), { page: "1" }, state)).toBe(
      false
    )
    expect(
      isCanonicalQuery(categoryTarget("cpu"), { sort: "newest" }, state)
    ).toBe(false)
    expect(
      isCanonicalQuery(categoryTarget("cpu"), { utm_source: "x" }, state)
    ).toBe(false)
    expect(
      isCanonicalQuery(
        categoryTarget("cpu"),
        { page: ["2", "2"] },
        plain({ page: 2 })
      )
    ).toBe(false)
  })

  it("rejects bad, repeated, unsorted and spelled-out filter values", () => {
    const amd = plain({ filters: { brand: ["amd"] } })
    expect(
      isCanonicalQuery(categoryTarget("cpu"), { brand: ["amd", "amd"] }, amd)
    ).toBe(false)
    expect(
      isCanonicalQuery(categoryTarget("cpu"), { brand: ["amd", "BAD"] }, amd)
    ).toBe(false)
    expect(
      isCanonicalQuery(
        categoryTarget("cpu"),
        { brand: "amd", inStock: "0" },
        amd
      )
    ).toBe(false)
    expect(
      isCanonicalQuery(
        categoryTarget("cpu"),
        { brand: ["intel", "amd"] },
        plain({ filters: { brand: ["amd", "intel"] } })
      )
    ).toBe(false)
    expect(
      isCanonicalQuery(
        categoryTarget("cpu"),
        { minPrice: "20000", maxPrice: "10000" },
        plain({ filters: { price: { min: 10000, max: 20000 } } })
      )
    ).toBe(false)
  })

  it("rejects keys in another order", () => {
    expect(
      isCanonicalQuery(
        categoryTarget("cpu"),
        { page: "2", sort: "price-asc" },
        plain({ sort: "price-asc", page: 2 })
      )
    ).toBe(false)
    expect(
      isCanonicalQuery(
        categoryTarget("cpu"),
        { sort: "price-asc", inStock: "1" },
        plain({ sort: "price-asc", filters: { inStock: true } })
      )
    ).toBe(false)
  })
})

describe("search (docs/specs/014-search)", () => {
  const search = (q: string) => searchTarget({ q })

  describe("cleanQuery", () => {
    it("is empty without a query", () => {
      expect(cleanQuery({})).toBe("")
      expect(cleanQuery({ q: "" })).toBe("")
      expect(cleanQuery({ q: "   " })).toBe("")
    })

    it("trims and collapses whitespace, keeping the case", () => {
      expect(cleanQuery({ q: "  RTX \t\n 5070  " })).toBe("RTX 5070")
    })

    it("turns control characters into spaces", () => {
      expect(cleanQuery({ q: "rtx\u00005070\u0007x" })).toBe("rtx 5070 x")
    })

    it("uses the first of repeated queries", () => {
      expect(cleanQuery({ q: ["b650", "x670"] })).toBe("b650")
    })

    it("keeps at most 100 characters, counting emoji as one", () => {
      expect(cleanQuery({ q: "a".repeat(300) })).toBe("a".repeat(100))
      expect(cleanQuery({ q: "😀".repeat(150) })).toBe("😀".repeat(100))
      // A cut that ends on a space doesn't leave it behind
      expect(cleanQuery({ q: `${"a".repeat(99)} b` })).toBe("a".repeat(99))
    })

    it("keeps odd characters for the database to normalize", () => {
      expect(cleanQuery({ q: "a&b|c:* '\"(" })).toBe("a&b|c:* '\"(")
    })
  })

  describe("sorts", () => {
    it("offers Best match first, and defaults to it, only with a query", () => {
      expect(sortsFor(search("rtx"))).toEqual([
        "relevance",
        "newest",
        "price-asc",
        "price-desc",
      ])
      expect(defaultSort(search("rtx"))).toBe("relevance")
      expect(sortsFor(search(""))).toEqual([
        "newest",
        "price-asc",
        "price-desc",
      ])
      expect(defaultSort(search(""))).toBe("newest")
    })

    it("never offers Best match on a category", () => {
      expect(sortsFor(categoryTarget("cpu"))).not.toContain("relevance")
      expect(defaultSort(categoryTarget("cpu"))).toBe("newest")
      expect(
        parseListingParams(categoryTarget("cpu"), { sort: "relevance" }).sort
      ).toBe("newest")
    })

    it("ignores Best match without a query", () => {
      expect(parseListingParams(search(""), { sort: "relevance" }).sort).toBe(
        "newest"
      )
    })
  })

  describe("URL state", () => {
    it("parses the category filter, then the common ones", () => {
      expect(
        parseListingParams(search("rtx"), {
          q: "rtx",
          category: ["gpu", "cpu"],
          brand: "asus",
          inStock: "1",
          sort: "price-asc",
          page: "2",
        })
      ).toEqual({
        sort: "price-asc",
        page: 2,
        filters: { category: ["cpu", "gpu"], brand: ["asus"], inStock: true },
      })
    })

    it("ignores spec filters, which search doesn't have", () => {
      expect(
        parseListingParams(search("rtx"), { socket: "AM5" }).filters
      ).toEqual({})
    })

    it("writes q first, then filters, sort and page; defaults omitted", () => {
      const state: ListingState = {
        sort: "price-desc",
        page: 2,
        filters: { brand: ["asus"], category: ["gpu"] },
      }
      expect(listingHref(search("rtx 5070"), state)).toBe(
        "/search?q=rtx+5070&category=gpu&brand=asus&sort=price-desc&page=2"
      )
      expect(listingHref(search("rtx"), plain({ sort: "relevance" }))).toBe(
        "/search?q=rtx"
      )
      expect(listingHref(search(""), plain())).toBe("/search")
      expect(
        listingHref(search(""), plain({ filters: { brand: ["asus"] } }))
      ).toBe("/search?brand=asus")
    })

    it("round-trips through the parser", () => {
      const target = search("16gb ddr5")
      const state: ListingState = {
        sort: "newest",
        page: 3,
        filters: {
          category: ["memory"],
          price: { min: 3000, max: null },
        },
      }
      const raw = Object.fromEntries(
        new URLSearchParams(listingQuery(target, state))
      )
      expect(searchTarget(raw)).toEqual(target)
      expect(parseListingParams(target, raw)).toEqual(state)
    })

    it("accepts only the cleaned, canonical query", () => {
      const target = search("rtx 5070")
      const state = plain({ sort: "relevance" })
      expect(isCanonicalQuery(target, { q: "rtx 5070" }, state)).toBe(true)
      expect(isCanonicalQuery(target, { q: " rtx  5070 " }, state)).toBe(false)
      expect(
        isCanonicalQuery(target, { q: "rtx 5070", sort: "relevance" }, state)
      ).toBe(false)
      expect(isCanonicalQuery(search(""), { q: "" }, plain())).toBe(false)
      expect(isCanonicalQuery(search(""), {}, plain())).toBe(true)
    })
  })
})

describe("searchHref", () => {
  it("links a search with the default sort", () => {
    expect(searchHref("rtx 5070")).toBe("/search?q=rtx+5070")
  })

  it("links browsing without a query (docs/specs/016-home-page)", () => {
    expect(searchHref("", { brand: ["amd"] })).toBe("/search?brand=amd")
    expect(searchHref("", { onSale: true })).toBe("/search?onSale=1")
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
