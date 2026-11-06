import { describe, expect, it } from "vitest"

import {
  DEFAULT_INVENTORY_PARAMS,
  inventoryHref,
  isCanonicalHistoryQuery,
  isCanonicalInventoryQuery,
  parseHistoryPage,
  parseInventoryParams,
  productInventoryHref,
  resolvePage,
} from "./inventory-params"

// docs/specs/046-admin-inventory-adjustments: E5, E28

describe("parseInventoryParams", () => {
  it("defaults when nothing is given", () => {
    expect(parseInventoryParams({})).toEqual(DEFAULT_INVENTORY_PARAMS)
  })

  it("E5: a one-character search is dropped", () => {
    const params = parseInventoryParams({ q: "r" })
    expect(params.q).toBe("")
    expect(isCanonicalInventoryQuery({ q: "r" }, params)).toBe(false)
  })

  it("keeps a real search, a builder category and a level", () => {
    expect(
      parseInventoryParams({ q: " rtx 5070 ", category: "gpu", level: "low" })
    ).toEqual({ q: "rtx 5070", category: "gpu", level: "low", page: 1 })
  })

  it("bad values fall back to the default", () => {
    expect(
      parseInventoryParams({
        category: "toaster",
        level: "everything",
        page: "0",
      })
    ).toEqual(DEFAULT_INVENTORY_PARAMS)
    expect(parseInventoryParams({ page: "abc" }).page).toBe(1)
    expect(parseInventoryParams({ page: "-2" }).page).toBe(1)
  })

  it("a repeated key counts by its first value", () => {
    expect(parseInventoryParams({ level: ["out", "low"] }).level).toBe("out")
  })

  it("the canonical URL is the serialized one", () => {
    const params = parseInventoryParams({
      q: "ryzen",
      level: "restock",
      page: "2",
    })
    expect(inventoryHref(params)).toBe(
      "/admin/inventory?q=ryzen&level=restock&page=2"
    )
    expect(
      isCanonicalInventoryQuery(
        { q: "ryzen", level: "restock", page: "2" },
        params
      )
    ).toBe(true)
    expect(isCanonicalInventoryQuery({ q: "ryzen", extra: "1" }, params)).toBe(
      false
    )
  })

  it("page 1 and empty filters leave the query out", () => {
    expect(inventoryHref(DEFAULT_INVENTORY_PARAMS)).toBe("/admin/inventory")
  })
})

describe("resolvePage (E28)", () => {
  it("a page past the last goes to the last; no match is page 1", () => {
    expect(resolvePage(3, 30, 25)).toBe(2)
    expect(resolvePage(2, 30, 25)).toBe(2)
    expect(resolvePage(9, 0, 25)).toBe(1)
  })
})

describe("the history page", () => {
  it("parses ?page= and redirects non-canonical forms", () => {
    expect(parseHistoryPage({})).toBe(1)
    expect(parseHistoryPage({ page: "2" })).toBe(2)
    expect(parseHistoryPage({ page: "abc" })).toBe(1)
    expect(isCanonicalHistoryQuery({}, 1)).toBe(true)
    expect(isCanonicalHistoryQuery({ page: "abc" }, 1)).toBe(false)
    expect(isCanonicalHistoryQuery({ page: "1" }, 1)).toBe(false)
    expect(isCanonicalHistoryQuery({ page: "2" }, 2)).toBe(true)
  })

  it("links to a product's page, encoding the id", () => {
    expect(productInventoryHref("abc")).toBe("/admin/inventory/abc")
    expect(productInventoryHref("abc", 2)).toBe("/admin/inventory/abc?page=2")
    expect(productInventoryHref("a/b")).toBe("/admin/inventory/a%2Fb")
  })
})
