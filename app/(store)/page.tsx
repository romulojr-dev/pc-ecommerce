import type { Metadata } from "next"

import { BrandList } from "@/components/home/brand-list"
import { CategoryTiles } from "@/components/home/category-tiles"
import { Hero } from "@/components/home/hero"
import { ProductSection } from "@/components/home/product-section"
import { TrustStrip } from "@/components/home/trust-strip"
import { Container } from "@/components/layout/container"
import { getMenuCategories } from "@/lib/categories"
import { getHomeBrands, getHomeProducts } from "@/lib/home"
import { searchHref } from "@/lib/listing-params"
import { manilaToday } from "@/lib/stock"

// Static, regenerated at most every 10 minutes (docs/specs/016-home-page,
// ADR 0003): its data is cached by tag, and prices and stock may be up to
// that old here. Product pages, listings and checkout stay per request.
// Must match HOME_REVALIDATE in lib/home.ts (a segment config must be a
// literal).
export const revalidate = 600

// Absolute through the root layout's metadataBase (docs/specs/017-seo)
export const metadata: Metadata = {
  alternates: { canonical: "/" },
}

export default async function HomePage() {
  const [categories, { featured, deals }, brands] = await Promise.all([
    getMenuCategories(),
    getHomeProducts(),
    getHomeBrands(),
  ])
  // For pre-order labels; as old as the page, at most 10 minutes
  const today = manilaToday()

  return (
    <Container className="pb-16">
      <Hero hasDeals={deals.length > 0} />
      <CategoryTiles categories={categories} />
      <ProductSection
        id="featured-products"
        title="Featured products"
        description="Popular picks for new builds and upgrades."
        products={featured}
        today={today}
      />
      <ProductSection
        id="deals-heading"
        anchor="deals"
        title="Deals"
        description="Limited-time prices on parts that finish a build."
        products={deals}
        today={today}
        action={{
          label: "View all deals",
          href: searchHref("", { onSale: true }),
        }}
      />
      <BrandList brands={brands} />
      <TrustStrip />
    </Container>
  )
}
