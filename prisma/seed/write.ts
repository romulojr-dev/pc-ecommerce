import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import { builderCategories } from "@/lib/specs"

import type { ValidPart, ValidSeedFile } from "./validate"

// What a re-seed refreshes on a product that already exists (spec.md, "Which
// product fields the seed writes"). Everything else (price, salePrice,
// stock, lowStockAt, status, preorderShipsOn, slug) is set on create only,
// because once the store runs, orders and the admin panel own those values.
// isFeatured is refreshed too, so a re-seed sets the home page's picks
// (docs/specs/016-home-page); it moves to create-only once the admin panel
// manages it.
const CATALOG_FIELDS = [
  "isFeatured",
  "name",
  "description",
  "specs",
  "categoryId",
  "brandId",
  "weightGrams",
  "warrantyMonths",
  "boxContents",
] as const

export type SeedCounts = {
  categories: number
  brands: number
  created: number
  updated: number
  // ProductImage rows added
  images: number
}

export class SeedWriteError extends Error {}

// Writes the validated seed in one transaction: on any failure, nothing is
// written (and a --reset truncate is rolled back too).
export function writeSeed(
  db: PrismaClient,
  files: ValidSeedFile[],
  { reset }: { reset: boolean }
): Promise<SeedCounts> {
  return db.$transaction(
    async (tx) => {
      if (reset) {
        // CASCADE also empties tables that reference products (BuildItem,
        // CartItem, and orders, … in later stories): a clean slate. "Build"
        // and "Cart" are named too: nothing in them points at a product, so
        // CASCADE from "Product" would leave them behind with no items
        // (docs/specs/022-share-build, D9; docs/specs/025-cart-single-items).
        // Add each new table of that kind here.
        await tx.$executeRaw`TRUNCATE TABLE "Build", "Cart", "ProductImage", "Product", "Brand", "Category" CASCADE`
      }

      const categoryIds = await upsertCategories(tx)
      const parts = files.flatMap(({ category, parts }) =>
        parts.map((part) => ({ part, categoryId: categoryIds.get(category)! }))
      )
      const brandIds = await upsertBrands(
        tx,
        parts.map(({ part }) => part)
      )

      // Existing products by SKU, with how many images each has
      const existing = new Map(
        (
          await tx.product.findMany({
            where: { sku: { in: parts.map(({ part }) => part.sku) } },
            select: { sku: true, _count: { select: { images: true } } },
          })
        ).map(({ sku, _count }) => [sku, _count.images])
      )
      const newParts = parts.filter(({ part }) => !existing.has(part.sku))
      await checkSlugConflicts(
        tx,
        newParts.map(({ part }) => part)
      )

      let imagesAdded = 0
      for (const { part, categoryId } of parts) {
        const data = productData(
          part,
          categoryId,
          brandIds.get(part.brandSlug)!
        )
        // Images are added only to a product that has none: once the admin
        // panel manages a product's images, a re-seed leaves them alone
        const images = {
          create: part.images.map((image, index) => ({
            ...image,
            sortOrder: index,
          })),
        }
        const imageCount = existing.get(part.sku)
        if (imageCount === undefined) {
          await tx.product.create({ data: { ...data, images } })
          imagesAdded += part.images.length
        } else if (imageCount === 0) {
          await tx.product.update({
            where: { sku: part.sku },
            data: { ...pick(data, CATALOG_FIELDS), images },
          })
          imagesAdded += part.images.length
        } else {
          await tx.product.update({
            where: { sku: part.sku },
            data: pick(data, CATALOG_FIELDS),
          })
        }
      }

      return {
        categories: categoryIds.size,
        brands: brandIds.size,
        created: newParts.length,
        updated: parts.length - newParts.length,
        images: imagesAdded,
      }
    },
    // Prisma's default is 5 s; ~150 sequential writes to a remote database
    // can take longer (60 parts took under 30 s against Neon, so 150 may
    // take about 75 s)
    { maxWait: 10_000, timeout: 180_000 }
  )
}

// Category rows come from the registry, so names and order match the code
async function upsertCategories(tx: Prisma.TransactionClient) {
  const ids = new Map<string, string>()
  for (const [slug, { name, sortOrder }] of Object.entries(builderCategories)) {
    const { id } = await tx.category.upsert({
      where: { slug },
      create: { slug, name, sortOrder },
      update: { name, sortOrder },
      select: { id: true },
    })
    ids.set(slug, id)
  }
  return ids
}

// One brand per slug; the first spelling in the data names it
async function upsertBrands(tx: Prisma.TransactionClient, parts: ValidPart[]) {
  const names = new Map<string, string>()
  for (const { brandSlug, brand } of parts) {
    if (!names.has(brandSlug)) names.set(brandSlug, brand)
  }
  const ids = new Map<string, string>()
  for (const [slug, name] of names) {
    const { id } = await tx.brand.upsert({
      where: { slug },
      create: { slug, name },
      update: { name },
      select: { id: true },
    })
    ids.set(slug, id)
  }
  return ids
}

// A new part's slug may already belong to a product that isn't in the seed
// (e.g. one created in the admin panel). Fail with both SKUs instead of a
// raw unique-constraint error.
async function checkSlugConflicts(
  tx: Prisma.TransactionClient,
  newParts: ValidPart[]
) {
  const taken = await tx.product.findMany({
    where: { slug: { in: newParts.map((part) => part.slug) } },
    select: { slug: true, sku: true },
  })
  if (taken.length === 0) return
  const lines = taken.map(({ slug, sku }) => {
    const part = newParts.find((p) => p.slug === slug)!
    return `  slug "${slug}" for sku ${part.sku} is already used by sku ${sku}`
  })
  throw new SeedWriteError(
    ["Seed failed: slug conflicts. Nothing was written.", ...lines].join("\n")
  )
}

function productData(part: ValidPart, categoryId: string, brandId: string) {
  return {
    sku: part.sku,
    slug: part.slug,
    name: part.name,
    // null (not undefined) so removing a description from the data clears it
    description: part.description ?? null,
    price: part.price,
    salePrice: part.salePrice ?? null,
    stock: part.stock,
    lowStockAt: part.lowStockAt,
    specs: part.specs as Prisma.InputJsonValue,
    weightGrams: part.weightGrams,
    warrantyMonths: part.warrantyMonths,
    boxContents: part.boxContents ?? [],
    // "2027-01-15" parses as UTC midnight, which a date column stores as
    // that day
    preorderShipsOn: part.preorderShipsOn
      ? new Date(part.preorderShipsOn)
      : null,
    status: part.status,
    isFeatured: part.featured ?? false,
    categoryId,
    brandId,
  } satisfies Prisma.ProductUncheckedCreateInput
}

function pick<T extends object, K extends keyof T>(
  object: T,
  keys: readonly K[]
): Pick<T, K> {
  return Object.fromEntries(keys.map((key) => [key, object[key]])) as Pick<T, K>
}
