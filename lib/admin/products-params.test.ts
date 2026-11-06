import { describe, expect, it } from "vitest"

import {
  isCanonicalProductQuery,
  parseProductParams,
  productParamsHref,
  resolveProductPage,
} from "./products-params"

describe("parseProductParams", () => {
  it("falls back to defaults on bad values", () => {
    expect(
      parseProductParams({ category: "monitors", status: "x", page: "0" })
    ).toEqual({ q: "", category: null, status: null, page: 1 })
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

describe("resolveProductPage", () => {
  it("sends a page past the last to the last and no match to page 1", () => {
    expect(resolveProductPage(9, 51)).toBe(3)
    expect(resolveProductPage(4, 0)).toBe(1)
    expect(resolveProductPage(2, 26)).toBe(2)
  })
})
