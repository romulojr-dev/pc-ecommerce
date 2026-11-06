import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { DEFAULT_INVENTORY_PARAMS } from "@/lib/admin/inventory-params"
import type { InventoryList } from "@/lib/admin/queries/inventory"

import { InventoryListView } from "./inventory-list"
import { InventoryFilters } from "./inventory-filters"

// docs/specs/046-admin-inventory-adjustments: E1–E4 as markup, B7

const row = {
  id: "p1",
  name: "AMD Ryzen 5 7600",
  sku: "100-100001015BOX",
  categorySlug: "cpu",
  categoryName: "CPU",
  status: "ACTIVE",
  stock: 4,
  lowStockAt: 5,
}
const data = (
  rows: InventoryList["rows"],
  total = rows.length
): InventoryList => ({
  ok: true,
  rows,
  total,
  page: 1,
  pageCount: 1,
})
const html = (list: InventoryList, params = DEFAULT_INVENTORY_PARAMS) =>
  renderToStaticMarkup(<InventoryListView data={list} params={params} />)

describe("InventoryListView", () => {
  it("E1: links to the inventory page, never the products screen", () => {
    const out = html(data([row]))
    expect(out).toContain('href="/admin/inventory/p1"')
    expect(out).not.toContain("/admin/products")
    expect(out).toContain("AMD Ryzen 5 7600")
    expect(out).toContain("1 product")
  })

  it("shows the level badge: Low stock, Out of stock, nothing when fine", () => {
    const out = html(
      data([
        row,
        { ...row, id: "p2", name: "Empty", stock: 0 },
        { ...row, id: "p3", name: "Plenty", stock: 50 },
        { ...row, id: "p4", name: "Off", stock: 1, lowStockAt: 0 },
      ])
    )
    expect(out.match(/Low stock/g)).toHaveLength(1)
    expect(out.match(/Out of stock/g)).toHaveLength(1)
  })

  it("shows every status as a badge, drafts included", () => {
    const out = html(data([{ ...row, status: "DRAFT" }]))
    expect(out).toContain("Draft")
  })

  it("says when there are no products, and when a filter matches none", () => {
    expect(html(data([]))).toContain("No products yet.")
    const filtered = html(data([]), {
      ...DEFAULT_INVENTORY_PARAMS,
      level: "low",
    })
    expect(filtered).toContain("No products match.")
    expect(filtered).toContain("Clear filters")
  })

  it("pages keep the filters in their links", () => {
    const out = html(
      { ...data([row], 60), page: 2, pageCount: 3 },
      { ...DEFAULT_INVENTORY_PARAMS, level: "restock", page: 2 }
    )
    expect(out).toContain("Page 2 of 3")
    expect(out).toContain('href="/admin/inventory?level=restock"')
    expect(out).toContain('href="/admin/inventory?level=restock&amp;page=3"')
  })
})

describe("InventoryFilters", () => {
  it("is a GET form with the three controls and the four levels", () => {
    const out = renderToStaticMarkup(
      <InventoryFilters params={DEFAULT_INVENTORY_PARAMS} resultsId="r" />
    )
    expect(out).toContain('method="get"')
    for (const text of [
      "Search by name, SKU or brand",
      "All categories",
      "Stock level",
      "Low stock",
      "Out of stock",
      "Needs restocking",
    ]) {
      expect(out).toContain(text)
    }
    expect(out).not.toContain("Clear filters")
  })

  it("offers Clear filters once one is active, and keeps the values", () => {
    const out = renderToStaticMarkup(
      <InventoryFilters
        params={{ ...DEFAULT_INVENTORY_PARAMS, q: "ryzen", level: "out" }}
        resultsId="r"
      />
    )
    expect(out).toContain("Clear filters")
    expect(out).toContain('value="ryzen"')
  })
})
