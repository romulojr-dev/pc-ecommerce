import { unstable_cache } from "next/cache"

import { db } from "@/lib/db"
import {
  type ProductCardData,
  productCardSelect,
  toProductCardData,
} from "@/lib/products"

// The home page's product data (docs/specs/016-home-page). Shared and
// refreshed every 10 minutes, not queried per request (ADR 0003): the home
// page is a teaser, and the product page, listings and checkout re-read
// prices and stock. Anything that writes products or brands must
// invalidate this tag.
export const PRODUCTS_TAG = "products"

// Cards per section
export const HOME_LIMIT = 8

// How long out-of-band changes (the seed, the Neon console) can take to show
const HOME_REVALIDATE = 600

export type HomeProducts = {
  featured: ProductCardData[]
  deals: ProductCardData[]
}

export type HomeBrand = { name: string; slug: string }

// Featured products, then deals without them, in one snapshot so the two
// never show the same product
export async function loadHomeProducts(): Promise<HomeProducts> {
  const featured = await db.product.findMany({
    where: { isFeatured: true, status: "ACTIVE" },
    select: { id: true, ...productCardSelect },
    orderBy: [
      { category: { sortOrder: "asc" } },
      { name: "asc" },
      { id: "asc" },
    ],
    take: HOME_LIMIT,
  })
  const deals = await loadDeals(featured.map(({ id }) => id))
  return { featured: featured.map(toProductCardData), deals }
}

// Active products on sale (a sale price below the list price) that can be
// bought (stock left; pre-orders count), skipping `excludeIds`. Biggest
// discount first: the whole percent off, floored like discountPercent, then
// the bigger saving, then name and id. A typed orderBy can't sort by an
// expression, so one raw query picks the ids, like getRelatedProducts.
// bigint: the saving × 100 can pass the int range near the price cap.
async function loadDeals(excludeIds: string[]): Promise<ProductCardData[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Product"
    WHERE "status" = 'ACTIVE'
      AND "salePrice" < "price"
      AND "stock" > 0
      AND "id" <> ALL(${excludeIds}::text[])
    ORDER BY (("price" - "salePrice")::bigint * 100) / "price" DESC,
             "price" - "salePrice" DESC,
             "name", "id"
    LIMIT ${HOME_LIMIT}`
  if (rows.length === 0) return []

  const position = new Map(rows.map(({ id }, index) => [id, index]))
  const products = await db.product.findMany({
    where: { id: { in: [...position.keys()] } },
    select: { id: true, ...productCardSelect },
  })
  return products
    .sort((a, b) => position.get(a.id)! - position.get(b.id)!)
    .map(toProductCardData)
}

// Brands with at least one active product, for Shop by brand. Sorted here,
// like the brand filter's options: the database orders by case, which
// would put "be quiet!" after "Western Digital".
export async function loadHomeBrands(): Promise<HomeBrand[]> {
  const brands = await db.brand.findMany({
    where: { products: { some: { status: "ACTIVE" } } },
    select: { name: true, slug: true },
  })
  return brands.sort((a, b) => a.name.localeCompare(b.name, "en"))
}

// The cached versions the page uses. The loaders above are exported for the
// tests, since unstable_cache needs Next's request context.
export const getHomeProducts = unstable_cache(
  loadHomeProducts,
  ["home-products"],
  { tags: [PRODUCTS_TAG], revalidate: HOME_REVALIDATE }
)

export const getHomeBrands = unstable_cache(loadHomeBrands, ["home-brands"], {
  tags: [PRODUCTS_TAG],
  revalidate: HOME_REVALIDATE,
})
