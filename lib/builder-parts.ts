import type { Prisma } from "@/generated/prisma/client"
import type { BuilderPartData } from "@/lib/build-state/parts"
import { db } from "@/lib/db"
import type { DbClient } from "@/lib/db-client"
import { toDateString } from "@/lib/products"
import { isBuilderCategory, validateSpecs } from "@/lib/specs"
import { getStockStatus } from "@/lib/stock"

// What the builder reads about a product: the engine's part, plus what a
// slot row and the summary show. The parts route and the slot picker's
// candidates (lib/builder-candidates.ts) both load it.
export const builderPartSelect = {
  id: true,
  name: true,
  slug: true,
  price: true,
  salePrice: true,
  effectivePrice: true,
  stock: true,
  lowStockAt: true,
  preorderShipsOn: true,
  specs: true,
  brand: { select: { name: true } },
  category: { select: { slug: true } },
  images: {
    select: { url: true, alt: true },
    orderBy: { sortOrder: "asc" },
    take: 1,
  },
} satisfies Prisma.ProductSelect

type BuilderPartRow = Prisma.ProductGetPayload<{
  select: typeof builderPartSelect
}>

// A row as builder data, or null when it can't be one: outside the builder
// categories, or specs that don't validate. Every write validates specs (ADR
// 0001), so that is a bad manual edit; it is logged, and the page treats the
// part as not available.
export function toBuilderPartData(
  row: BuilderPartRow,
  today: string
): BuilderPartData | null {
  const category = row.category.slug
  if (!isBuilderCategory(category)) return null
  const specs = validateSpecs(category, row.specs)
  if (!specs.success) {
    console.error(`Invalid specs for product ${row.slug}:`, specs.error.issues)
    return null
  }
  return {
    part: {
      id: row.id,
      name: row.name,
      category,
      specs: specs.data,
    } as BuilderPartData["part"],
    slug: row.slug,
    brand: row.brand.name,
    price: row.price,
    salePrice: row.salePrice,
    effectivePrice: row.effectivePrice,
    stock: row.stock,
    stockStatus: getStockStatus(
      { ...row, preorderShipsOn: toDateString(row.preorderShipsOn) },
      today
    ),
    image: row.images[0] ?? null,
  }
}

// The builder's parts by id (docs/specs/020-builder-page, "Loading parts"):
// active products in a builder category, with current prices and stock, read
// on every call (ADR 0003: per-request data). Ids that aren't found are
// simply absent; the page works out what's missing with assembleBuild.
export async function getBuilderParts(
  ids: readonly string[],
  today: string,
  client: DbClient = db
): Promise<BuilderPartData[]> {
  const rows = await client.product.findMany({
    where: { id: { in: [...ids] }, status: "ACTIVE" },
    select: builderPartSelect,
  })
  return rows.flatMap((row) => toBuilderPartData(row, today) ?? [])
}
