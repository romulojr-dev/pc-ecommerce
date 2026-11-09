import { describe, expect, it } from "vitest"

import {
  hasActiveProductFilters,
  isCanonicalProductQuery,
  parseProductParams,
  productParamsHref,
  resolveProductPage,
} from "./products-params"

describe("parseProductParams", () => {
  it("falls back to defaults on bad values", () => {
    expect(
      parseProductParams({ category: "monitors", status: "x", page: "0" })
    ).toEqual({ q: "", category: null, status: null, photos: null, page: 1 })
  })

  it("drops a one-character search (E3)", () => {
    const params = parseProductParams({ q: " r " })
    expect(params.q).toBe("")
    expect(isCanonicalProductQuery({ q: " r " }, params)).toBe(false)
    expect(productParamsHref(params)).toBe("/admin/products")
  })

  it("reads search, category, status and page (E4)", () => {
    const raw = { q: "ryzen", category: "gpu", status: "draft", page: "3" }
    const params = parseProductParams(raw)
    expect(params).toEqual({
      q: "ryzen",
      category: "gpu",
      status: "draft",
      photos: null,
      page: 3,
    })
    expect(isCanonicalProductQuery(raw, params)).toBe(true)
    expect(productParamsHref(params)).toBe(
      "/admin/products?q=ryzen&category=gpu&status=draft&page=3"
    )
  })

  it("is not canonical with a repeated or default key", () => {
    const params = parseProductParams({ page: "1" })
    expect(isCanonicalProductQuery({ page: "1" }, params)).toBe(false)
  })
})

describe("the photos filter (docs/specs/049-product-images-upload, B23, E36)", () => {
  it("reads photos=missing and writes it back", () => {
    const raw = { photos: "missing" }
    const params = parseProductParams(raw)
    expect(params.photos).toBe("missing")
    expect(isCanonicalProductQuery(raw, params)).toBe(true)
    expect(productParamsHref(params)).toBe("/admin/products?photos=missing")
  })

  it("E36: any other value is the default and the URL redirects", () => {
    const raw = { photos: "yes" }
    const params = parseProductParams(raw)
    expect(params.photos).toBeNull()
    expect(isCanonicalProductQuery(raw, params)).toBe(false)
    expect(productParamsHref(params)).toBe("/admin/products")
  })

  it("combines with the other filters, in a fixed order, and counts as a filter", () => {
    const params = parseProductParams({
      photos: "missing",
      status: "draft",
      category: "cpu",
    })
    expect(productParamsHref(params)).toBe(
      "/admin/products?category=cpu&status=draft&photos=missing"
    )
    expect(hasActiveProductFilters(params)).toBe(true)
    expect(hasActiveProductFilters(parseProductParams({}))).toBe(false)
  })

  it("changing the filter starts at page 1 (the form leaves the page out)", () => {
    const params = parseProductParams({ photos: "missing", page: "3" })
    expect(productParamsHref({ ...params, page: 1 })).toBe(
      "/admin/products?photos=missing"
    )
  })
})

describe("resolveProductPage", () => {
  it("sends a page past the last to the last and no match to page 1", () => {
    expect(resolveProductPage(9, 51)).toBe(3)
    expect(resolveProductPage(4, 0)).toBe(1)
    expect(resolveProductPage(2, 26)).toBe(2)
  })
})
