import { cache } from "react"

import type { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import {
  type FilterOptions,
  type FilterValues,
  listingFilters,
} from "@/lib/listing-filters"
import {
  activeWhere,
  type FilterContext,
  type FilterScope,
  loadFilterOptions,
} from "@/lib/listing-filters/server"
import {
  type ListingSort,
  type ListingState,
  PAGE_SIZE,
} from "@/lib/listing-params"

// What a product card shows. Plain data, so client components can render
// cards too (docs/specs/008-category-listing).
export type ProductCardData = {
  name: string
  slug: string
  categorySlug: string
  brand: string
  // Centavos; salePrice is what the shopper pays when it is set
  price: number
  salePrice: number | null
  stock: number
  lowStockAt: number
  // "YYYY-MM-DD" while on pre-order, else null (lib/stock.ts)
  preorderShipsOn: string | null
  // The first image, or null when the product has none
  image: { url: string; alt: string } | null
}

// The fields a card needs; listings, search and related products all load
// products with this select and map them with toProductCardData
export const productCardSelect = {
  name: true,
  slug: true,
  price: true,
  salePrice: true,
  stock: true,
  lowStockAt: true,
  preorderShipsOn: true,
  brand: { select: { name: true } },
  category: { select: { slug: true } },
  images: {
    select: { url: true, alt: true },
    orderBy: { sortOrder: "asc" },
    take: 1,
  },
} satisfies Prisma.ProductSelect

type ProductCardRow = Prisma.ProductGetPayload<{
  select: typeof productCardSelect
}>

export function toProductCardData(row: ProductCardRow): ProductCardData {
  return {
    name: row.name,
    slug: row.slug,
    categorySlug: row.category.slug,
    brand: row.brand.name,
    price: row.price,
    salePrice: row.salePrice,
    stock: row.stock,
    lowStockAt: row.lowStockAt,
    preorderShipsOn: toDateString(row.preorderShipsOn),
    image: row.images[0] ?? null,
  }
}

// A date column (UTC midnight) as "YYYY-MM-DD", so product data stays plain
export function toDateString(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null
}

// Ties end on name, then id, so pages stay stable when sort values are equal
const tieBreakers: Prisma.ProductOrderByWithRelationInput[] = [
  { name: "asc" },
  { id: "asc" },
]

// The sorts a typed orderBy can do. Best match orders by search rank, which
// only lib/search.ts has (docs/specs/014-search).
export type ColumnSort = Exclude<ListingSort, "relevance">

// Price sorts use the price the shopper pays (ADR 0004), like the price filter
export const sortOrderBy: Record<
  ColumnSort,
  Prisma.ProductOrderByWithRelationInput[]
> = {
  newest: [{ createdAt: "desc" }, ...tieBreakers],
  "price-asc": [{ effectivePrice: "asc" }, ...tieBreakers],
  "price-desc": [{ effectivePrice: "desc" }, ...tieBreakers],
}

// The category a listing shows: its id scopes the queries, its slug picks
// its filters (docs/specs/013-spec-filters)
export type ListingCategory = { id: string; slug: string }

// The products a category's listing is about, before any filter
function categoryScope(categoryId: string) {
  return { categoryId, status: "ACTIVE" } satisfies FilterScope
}

// The options of the category's filters (brands, spec values) that its
// active products have, each counted with the other active filters applied
export function getFilterOptions(
  category: ListingCategory,
  filters: FilterValues,
  context: FilterContext
): Promise<FilterOptions> {
  return loadFilterOptions(
    categoryScope(category.id),
    filters,
    context,
    listingFilters(category.slug)
  )
}

// One page of a category's active products that pass the filters, plus how
// many there are in all. The caller checks the page against pageCount(total).
export async function getCategoryProducts(
  category: ListingCategory,
  { sort, page, filters }: ListingState,
  context: FilterContext
): Promise<{ products: ProductCardData[]; total: number }> {
  const where = {
    ...categoryScope(category.id),
    AND: activeWhere(filters, context, listingFilters(category.slug)),
  } satisfies Prisma.ProductWhereInput

  // A category never parses "relevance" (sortsFor); newest is its default
  return getListingPage(where, sort === "relevance" ? "newest" : sort, page)
}

// One page of the products matching `where` in a column sort, plus how many
// match in all: category listings, and search results not sorted by rank
export async function getListingPage(
  where: Prisma.ProductWhereInput,
  sort: ColumnSort,
  page: number
): Promise<{ products: ProductCardData[]; total: number }> {
  // Not $transaction: inside one, Prisma loads the relations as concurrent
  // queries on a single pg client, which pg deprecates. A count off by one
  // during a concurrent write is harmless here.
  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      select: productCardSelect,
      orderBy: sortOrderBy[sort],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ])

  return { products: rows.map(toProductCardData), total }
}

// Everything the product page shows (docs/specs/010-product-page). Plain
// data: dates as "YYYY-MM-DD", specs still unvalidated JSON.
export type ProductPageData = {
  id: string
  categoryId: string
  // The price the shopper pays (ADR 0004); related products are measured
  // from it
  effectivePrice: number
  name: string
  slug: string
  description: string | null
  brand: string
  category: { name: string; slug: string }
  price: number
  salePrice: number | null
  stock: number
  lowStockAt: number
  preorderShipsOn: string | null
  warrantyMonths: number
  boxContents: string[]
  specs: Prisma.JsonValue
  images: { url: string; alt: string }[]
}

// An active product by slug (slugs are unique across categories), or null.
// React cache: generateMetadata and the page share one query per request.
export const getProductPage = cache(
  async (slug: string): Promise<ProductPageData | null> => {
    const row = await db.product.findFirst({
      where: { slug, status: "ACTIVE" },
      select: {
        id: true,
        categoryId: true,
        effectivePrice: true,
        name: true,
        slug: true,
        description: true,
        price: true,
        salePrice: true,
        stock: true,
        lowStockAt: true,
        preorderShipsOn: true,
        warrantyMonths: true,
        boxContents: true,
        specs: true,
        brand: { select: { name: true } },
        category: { select: { name: true, slug: true } },
        images: {
          select: { url: true, alt: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    })
    if (!row) return null
    return {
      ...row,
      brand: row.brand.name,
      preorderShipsOn: toDateString(row.preorderShipsOn),
    }
  }
)

// The product that related products are measured from
export type RelatedSource = {
  id: string
  categoryId: string
  effectivePrice: number
}

export const RELATED_LIMIT = 4

// Up to 4 other active products from the same category, for "Similar
// products" (docs/specs/015-related-products). Available ones (stock left,
// pre-orders included) come first, so out-of-stock products only fill
// slots; then the closest in the price the shopper pays (ADR 0004). Equal
// distances go to the cheaper one, then name, then id. A typed orderBy can't
// sort by ABS(...), so one raw query picks the ids, like lib/search.ts.
export async function getRelatedProducts(
  source: RelatedSource
): Promise<ProductCardData[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Product"
    WHERE "categoryId" = ${source.categoryId}
      AND "status" = 'ACTIVE'
      AND "id" <> ${source.id}
    ORDER BY ("stock" > 0) DESC,
             ABS("effectivePrice" - ${source.effectivePrice}),
             "effectivePrice", "name", "id"
    LIMIT ${RELATED_LIMIT}`
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
