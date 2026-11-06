import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { DEFAULT_PRODUCT_PARAMS } from "@/lib/admin/products-params"
import type { ProductList } from "@/lib/admin/queries/products"

import { ProductListView } from "./product-list"

const row = {
  id: "p1",
  name: "AMD Ryzen 5 7600",
  sku: "100-100001015BOX",
  categorySlug: "cpu",
  categoryName: "CPU",
  brandName: "AMD",
  status: "ACTIVE" as const,
  price: 1_000_000,
  salePrice: 900_000,
  stock: 4,
  isFeatured: true,
}
const data = (rows: ProductList["rows"], total = rows.length): ProductList => ({
  ok: true,
  rows,
  total,
  page: 1,
  pageCount: 1,
})
const html = (list: ProductList, params = DEFAULT_PRODUCT_PARAMS) =>
  renderToStaticMarkup(<ProductListView data={list} params={params} />)

describe("ProductListView", () => {
  it("shows a row with its badges, sale price struck through and edit link (E1)", () => {
    const out = html(
      data([
        row,
        {
          ...row,
          id: "p2",
          status: "DRAFT",
          salePrice: null,
          isFeatured: false,
        },
      ])
    )
    expect(out).toContain("AMD Ryzen 5 7600")
    expect(out).toContain('href="/admin/products/p1"')
    expect(out).toContain("Active")
    expect(out).toContain("Draft")
    expect(out).toContain("Featured")
    expect(out).toContain("<s ")
    expect(out).toContain("2 products")
  })

  it("says when there are no products, and when a search matches none (B7)", () => {
    expect(html(data([]))).toContain("No products yet.")
    const filtered = html(data([]), { ...DEFAULT_PRODUCT_PARAMS, q: "zzz" })
    expect(filtered).toContain("No products match your search.")
    expect(filtered).toContain("Clear filters")
  })
})
