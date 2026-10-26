import { describe, expect, it } from "vitest"

import {
  isCanonicalQuery,
  listingHref,
  listingQuery,
  pageCount,
  PAGE_SIZE,
  paginationItems,
  parseListingParams,
  parseView,
} from "@/lib/listing-params"

describe("parseListingParams", () => {
  it("reads valid values", () => {
    expect(parseListingParams({ sort: "price-desc", page: "3" })).toEqual({
      sort: "price-desc",
      page: 3,
    })
  })

  it("defaults to newest, page 1", () => {
    expect(parseListingParams({})).toEqual({ sort: "newest", page: 1 })
  })

  it("falls back on an unknown sort", () => {
    expect(parseListingParams({ sort: "bogus" }).sort).toBe("newest")
  })

  it.each(["0", "-1", "2.5", "abc", "01", "", "99999999999999999999"])(
    "falls back to page 1 for %j",
    (page) => {
      expect(parseListingParams({ page }).page).toBe(1)
    }
  )

  it("uses the first value of a repeated key", () => {
    expect(
      parseListingParams({
        sort: ["price-asc", "price-desc"],
        page: ["2", "5"],
      })
    ).toEqual({ sort: "price-asc", page: 2 })
  })
})

describe("listingQuery and listingHref", () => {
  it("omits defaults", () => {
    expect(listingQuery({ sort: "newest", page: 1 })).toBe("")
    expect(listingHref("cpu", { sort: "newest", page: 1 })).toBe("/cpu")
  })

  it("writes keys in a fixed order", () => {
    expect(listingHref("gpu", { sort: "price-asc", page: 2 })).toBe(
      "/gpu?sort=price-asc&page=2"
    )
    expect(listingHref("gpu", { sort: "newest", page: 2 })).toBe("/gpu?page=2")
  })

  it("round-trips with the parser", () => {
    const state = { sort: "price-desc", page: 4 } as const
    const query = Object.fromEntries(new URLSearchParams(listingQuery(state)))
    expect(parseListingParams(query)).toEqual(state)
  })
})

describe("isCanonicalQuery", () => {
  it("accepts the canonical query", () => {
    expect(isCanonicalQuery({}, { sort: "newest", page: 1 })).toBe(true)
    expect(
      isCanonicalQuery(
        { sort: "price-asc", page: "2" },
        { sort: "price-asc", page: 2 }
      )
    ).toBe(true)
  })

  it("rejects bad values, spelled-out defaults, unknown and repeated keys", () => {
    const state = { sort: "newest", page: 1 } as const
    expect(isCanonicalQuery({ sort: "bogus" }, state)).toBe(false)
    expect(isCanonicalQuery({ page: "1" }, state)).toBe(false)
    expect(isCanonicalQuery({ sort: "newest" }, state)).toBe(false)
    expect(isCanonicalQuery({ utm_source: "x" }, state)).toBe(false)
    expect(
      isCanonicalQuery({ page: ["2", "2"] }, { sort: "newest", page: 2 })
    ).toBe(false)
  })

  it("rejects keys in another order", () => {
    expect(
      isCanonicalQuery(
        { page: "2", sort: "price-asc" },
        { sort: "price-asc", page: 2 }
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
