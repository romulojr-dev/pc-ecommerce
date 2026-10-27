import { unstable_cache } from "next/cache"

import { CATEGORIES_TAG } from "@/lib/categories"
import { db } from "@/lib/db"
import { PRODUCTS_TAG } from "@/lib/home"

// What sitemap.xml lists (docs/specs/017-seo): the home page, categories
// with at least one active product, and every active product. Only
// canonical, indexable URLs: no filters, sorts, later pages or search.
// Dates are ISO strings, since unstable_cache stores JSON.
export type SitemapData = {
  // The newest product change; null with no products
  homeModified: string | null
  categories: { slug: string; lastModified: string }[]
  products: { categorySlug: string; slug: string; lastModified: string }[]
}

export async function loadSitemapData(): Promise<SitemapData> {
  const [products, categories] = await Promise.all([
    db.product.findMany({
      where: { status: "ACTIVE" },
      select: {
        slug: true,
        updatedAt: true,
        category: { select: { slug: true } },
      },
      orderBy: [
        { category: { sortOrder: "asc" } },
        { name: "asc" },
        { id: "asc" },
      ],
    }),
    db.category.findMany({
      where: { parentId: null, products: { some: { status: "ACTIVE" } } },
      select: { slug: true, updatedAt: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ])

  // Each category's newest product change, from the rows already loaded
  const newestByCategory = new Map<string, number>()
  let newest: number | null = null
  for (const { updatedAt, category } of products) {
    const time = updatedAt.getTime()
    newestByCategory.set(
      category.slug,
      Math.max(newestByCategory.get(category.slug) ?? 0, time)
    )
    newest = Math.max(newest ?? 0, time)
  }

  return {
    homeModified: newest === null ? null : new Date(newest).toISOString(),
    categories: categories.map(({ slug, updatedAt }) => ({
      slug,
      lastModified: new Date(
        Math.max(updatedAt.getTime(), newestByCategory.get(slug) ?? 0)
      ).toISOString(),
    })),
    products: products.map(({ slug, updatedAt, category }) => ({
      categorySlug: category.slug,
      slug,
      lastModified: updatedAt.toISOString(),
    })),
  }
}

// The cached version the route uses (ADR 0003). App writes to products or
// categories invalidate it through their tags; the hour covers the seed and
// the Neon console. loadSitemapData is exported for the tests, since
// unstable_cache needs Next's request context.
export const getSitemapData = unstable_cache(loadSitemapData, ["sitemap"], {
  tags: [PRODUCTS_TAG, CATEGORIES_TAG],
  revalidate: 3600,
})
