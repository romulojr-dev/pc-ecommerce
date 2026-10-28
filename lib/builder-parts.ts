import type { BuilderPartData } from "@/lib/build-state/parts"
import { db } from "@/lib/db"
import { toDateString } from "@/lib/products"
import { isBuilderCategory, validateSpecs } from "@/lib/specs"
import { getStockStatus } from "@/lib/stock"

// The builder's parts by id (docs/specs/020-builder-page, "Loading parts"):
// active products in a builder category, with current prices and stock, read
// on every call (ADR 0003: per-request data). Ids that aren't found are
// simply absent; the page works out what's missing with assembleBuild.
export async function getBuilderParts(
  ids: readonly string[],
  today: string
): Promise<BuilderPartData[]> {
  const rows = await db.product.findMany({
    where: { id: { in: [...ids] }, status: "ACTIVE" },
    select: {
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
    },
  })

  return rows.flatMap((row) => {
    const category = row.category.slug
    if (!isBuilderCategory(category)) return []
    const specs = validateSpecs(category, row.specs)
    // Every write validates specs (ADR 0001), so this is a bad manual edit.
    // Left out, the page treats the part as no longer available.
    if (!specs.success) {
      console.error(
        `Invalid specs for product ${row.slug}:`,
        specs.error.issues
      )
      return []
    }
    const stockStatus = getStockStatus(
      { ...row, preorderShipsOn: toDateString(row.preorderShipsOn) },
      today
    )
    return [
      {
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
        stockStatus,
        image: row.images[0] ?? null,
      },
    ]
  })
}
