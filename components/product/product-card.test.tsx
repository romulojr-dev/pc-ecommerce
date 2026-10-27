import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"

import type { ProductCardData } from "@/lib/products"

import { ProductCard } from "./product-card"

// Markup check without a DOM (docs/specs/012-common-filters): the card shows
// the price the shopper pays
const product: ProductCardData = {
  name: "AMD Ryzen 5 7600",
  slug: "amd-ryzen-5-7600",
  categorySlug: "cpu",
  brand: "AMD",
  price: 1_149_500,
  salePrice: null,
  stock: 20,
  lowStockAt: 5,
  preorderShipsOn: null,
  image: null,
  summary: "AM5 · 6 cores · 5.1 GHz boost",
}

function render(overrides: Partial<ProductCardData> = {}) {
  return renderToStaticMarkup(
    <ProductCard
      product={{ ...product, ...overrides }}
      layout="grid"
      today="2026-10-26"
      sizes="272px"
    />
  )
}

test("shows the price alone when there is no sale", () => {
  const html = render()
  expect(html).toContain("₱11,495.00")
  expect(html).not.toContain("<s>")
  expect(html).not.toContain("Was")
})

test("shows the sale price, with the list price struck through", () => {
  const html = render({ salePrice: 999_900 })
  expect(html).toMatch(/<p class="[^"]*font-semibold[^"]*">₱9,999\.00<\/p>/)
  // The struck price is read out as "Was ₱11,495.00"
  expect(html).toMatch(/<span class="sr-only">Was <\/span><s>₱11,495\.00<\/s>/)
})

test("shows the spec summary line, and none when there is no summary", () => {
  expect(render()).toContain(">AM5 · 6 cores · 5.1 GHz boost</p>")
  expect(render({ summary: null })).not.toContain("·")
})
