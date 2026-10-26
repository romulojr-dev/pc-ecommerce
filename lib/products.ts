import { cache } from "react"

import type { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import type { FilterOptions } from "@/lib/listing-filters"
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
  price: number
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

// Price sorts use the price the shopper pays (ADR 0004), like the price filter
const sortOrderBy: Record<
  ListingSort,
  Prisma.ProductOrderByWithRelationInput[]
> = {
  newest: [{ createdAt: "desc" }, ...tieBreakers],
  "price-asc": [{ effectivePrice: "asc" }, ...tieBreakers],
  "price-desc": [{ effectivePrice: "desc" }, ...tieBreakers],
}

// The products a category's listing is about, before any filter
function categoryScope(categoryId: string) {
  return { categoryId, status: "ACTIVE" } satisfies FilterScope
}

// The options of the category's filters (its brands), from its active
// products, whatever filters are on
export function getFilterOptions(categoryId: string): Promise<FilterOptions> {
  return loadFilterOptions(categoryScope(categoryId))
}

// One page of a category's active products that pass the filters, plus how
// many there are in all. The caller checks the page against pageCount(total).
export async function getCategoryProducts(
  categoryId: string,
  { sort, page, filters }: ListingState,
  context: FilterContext
): Promise<{ products: ProductCardData[]; total: number }> {
  const where = {
    ...categoryScope(categoryId),
    AND: activeWhere(filters, context),
  } satisfies Prisma.ProductWhereInput

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
