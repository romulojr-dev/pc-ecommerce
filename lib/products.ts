import type { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"
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
    image: row.images[0] ?? null,
  }
}

// Ties end on name, then id, so pages stay stable when sort values are equal
const tieBreakers: Prisma.ProductOrderByWithRelationInput[] = [
  { name: "asc" },
  { id: "asc" },
]

const sortOrderBy: Record<
  ListingSort,
  Prisma.ProductOrderByWithRelationInput[]
> = {
  newest: [{ createdAt: "desc" }, ...tieBreakers],
  "price-asc": [{ price: "asc" }, ...tieBreakers],
  "price-desc": [{ price: "desc" }, ...tieBreakers],
}

// One page of a category's active products, plus how many there are in all.
// The caller checks the page against pageCount(total).
export async function getCategoryProducts(
  categoryId: string,
  { sort, page }: ListingState
): Promise<{ products: ProductCardData[]; total: number }> {
  const where = {
    categoryId,
    status: "ACTIVE",
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
