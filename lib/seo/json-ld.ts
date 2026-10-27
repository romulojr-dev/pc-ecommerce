import { productHref } from "@/lib/site"
import type { StockStatus } from "@/lib/stock"

import { absoluteUrl } from "./urls"

// Structured data for search engines (docs/specs/017-seo). Pure builders:
// the page passes its data and the site URL, and renders the result with
// <JsonLd>, which escapes it.

const SCHEMA = "https://schema.org"

export type JsonLdProduct = {
  name: string
  slug: string
  sku: string
  description: string | null
  brand: string
  category: { slug: string }
  // Centavos: what the shopper pays, the sale price when there is one
  // (ADR 0004)
  effectivePrice: number
  preorderShipsOn: string | null
  images: { url: string }[]
}

// Low stock can still be bought now, so it's InStock; LimitedAvailability
// adds nothing for search. A Record makes a new status a type error here.
export const schemaAvailability: Record<StockStatus, string> = {
  "in-stock": `${SCHEMA}/InStock`,
  "low-stock": `${SCHEMA}/InStock`,
  "pre-order": `${SCHEMA}/PreOrder`,
  "out-of-stock": `${SCHEMA}/OutOfStock`,
}

// Centavos to a schema.org price: 1299900 → "12999.00". Integer arithmetic
// only, so there's no floating-point rounding.
export function formatPriceAmount(centavos: number): string {
  const pesos = Math.trunc(centavos / 100)
  const rest = String(centavos % 100).padStart(2, "0")
  return `${pesos}.${rest}`
}

// A Product with one Offer. No ratings or reviews: there are none yet.
export function productJsonLd({
  product,
  status,
  siteUrl,
}: {
  product: JsonLdProduct
  status: StockStatus
  siteUrl: string
}) {
  return {
    "@context": SCHEMA,
    "@type": "Product",
    name: product.name,
    ...(product.images.length > 0 && {
      image: product.images.map(({ url }) => absoluteUrl(siteUrl, url)),
    }),
    ...(product.description && { description: product.description }),
    sku: product.sku,
    brand: { "@type": "Brand", name: product.brand },
    offers: {
      "@type": "Offer",
      url: absoluteUrl(
        siteUrl,
        productHref(product.category.slug, product.slug)
      ),
      priceCurrency: "PHP",
      price: formatPriceAmount(product.effectivePrice),
      availability: schemaAvailability[status],
      ...(status === "pre-order" &&
        product.preorderShipsOn && {
          availabilityStarts: product.preorderShipsOn,
        }),
      itemCondition: `${SCHEMA}/NewCondition`,
    },
  }
}

// One breadcrumb: a link when it has a path; the current page has none
export type Crumb = { name: string; path?: string }

// The same trail the page shows
export function breadcrumbJsonLd(items: Crumb[], siteUrl: string) {
  return {
    "@context": SCHEMA,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.path && { item: absoluteUrl(siteUrl, item.path) }),
    })),
  }
}

// JSON for a <script> element. Its content is raw text that only "</script"
// or "<!--" can end, so <, > and & become JSON \u escapes: the text then
// holds no "<" at all, and JSON.parse still returns the original strings.
export function serializeJsonLd(data: object): string {
  return JSON.stringify(data).replace(
    /[<>&]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
  )
}
