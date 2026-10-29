import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import { type Fit, fitOf, type FitPart } from "@/lib/build-state/fit"
import type { ProductCardData } from "@/lib/products"
import { ruleSpecsOf } from "@/lib/specs"
import { buildA, seed } from "@/test-support/seed-parts"

import { ProductCard } from "../product/product-card"
import { FitBadge } from "./fit-badge"

// The card's hint (docs/specs/023-fits-your-build-hints, Behavior 4–9, 8a;
// E23, E23a, E24)

const partOf = (part: typeof seed.proB760mDdr4): FitPart => ({
  id: part.id,
  slot: part.category,
  name: part.name,
  ruleSpecs: ruleSpecsOf(part.category, part.specs),
})

const errors = fitOf(buildA(), partOf(seed.proB760mDdr4))
const warnings = fitOf(buildA(), {
  id: seed.ryzen7_9800x3d.id,
  slot: "cpu",
  name: seed.ryzen7_9800x3d.name,
  ruleSpecs: ruleSpecsOf("cpu", seed.ryzen7_9800x3d.specs),
})

const render = (fit: Fit | null) => renderToStaticMarkup(<FitBadge fit={fit} />)

// The box that holds the hint
const BOX = '<div class="min-h-4 text-xs leading-4">'

describe("FitBadge", () => {
  test("reserves its line with no text before the build is read, and when there is nothing to show (E24, E26)", () => {
    for (const fit of [null, { kind: "none" } as const]) {
      const html = render(fit)
      expect(html).toBe(`${BOX}</div>`)
    }
  })

  test.each([
    [{ kind: "in-build" } as const, "In your build"],
    [{ kind: "fits" } as const, "Fits your build"],
  ])("%j reads %s, as text with a hidden icon and no reasons", (fit, label) => {
    const html = render(fit)
    expect(html).toContain(label)
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain("sr-only")
  })

  test("a part that doesn't fit lists its errors for screen readers, in order (E23)", () => {
    const html = render(errors)
    expect(html).toContain("Doesn&#x27;t fit your build")
    const list = html.slice(html.indexOf('<ul class="sr-only">'))
    expect(list).toContain("Error:")
    expect(list.indexOf("socket")).toBeLessThan(list.indexOf("DDR5 memory"))
    expect(list).toContain(
      "The AMD Ryzen 5 7600 (AM5) doesn&#x27;t fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4."
    )
  })

  test("a part that fits with warnings lists them as warnings", () => {
    const html = render(warnings)
    expect(html).toContain("Fits, with warnings")
    expect(html).toContain("Warning:")
    expect(html).toContain("may need a BIOS update")
  })

  test("is not a live region, a link or focusable (D10)", () => {
    for (const fit of [errors, warnings, { kind: "fits" } as const]) {
      const html = render(fit)
      expect(html).not.toMatch(/aria-live|role="status"|<a |tabindex|<button/)
    }
  })
})

describe("FitBadge in a card (E23a)", () => {
  const product: ProductCardData = {
    name: "MSI PRO B760M-A WiFi DDR4",
    slug: "msi-pro-b760m-a-wifi-ddr4",
    categorySlug: "motherboard",
    brand: "MSI",
    price: 650_000,
    salePrice: null,
    stock: 20,
    lowStockAt: 5,
    preorderShipsOn: null,
    image: null,
    summary: null,
  }
  const html = renderToStaticMarkup(
    <ProductCard product={product} layout="grid" today="2026-10-29" sizes="1px">
      <FitBadge fit={errors} />
    </ProductCard>
  )

  test("sits in the card's article and outside the name link", () => {
    expect(html.startsWith("<article")).toBe(true)
    const link = html.match(/<a [^>]*>([^<]*)<\/a>/)!
    // The link's name is the product's alone
    expect(link[1]).toBe("MSI PRO B760M-A WiFi DDR4")
    expect(html.indexOf("Doesn&#x27;t fit your build")).toBeGreaterThan(
      html.indexOf("</a>")
    )
    expect(html.indexOf("Doesn&#x27;t fit your build")).toBeLessThan(
      html.indexOf("</article>")
    )
  })
})
