import type { AnyBuildPart, Build, BuildItem } from "@/lib/builder"
import { toBuildItems } from "@/lib/builder"
import { builderCategories } from "@/lib/specs"

import { db } from "./db"

// Real seed parts in the test database, for the tests that share and read
// builds (docs/specs/022-share-build). Seed part ids are SKUs; the database
// makes its own ids, so these helpers map one to the other.

type Override = {
  status?: "ACTIVE" | "DRAFT"
  stock?: number
  // Centavos
  price?: number
  preorderShipsOn?: string
}

const ensureBrand = () =>
  db.brand.upsert({
    where: { slug: "fixture" },
    create: { name: "Fixture", slug: "fixture" },
    update: {},
  })

const ensureCategory = (slug: AnyBuildPart["category"]) =>
  db.category.upsert({
    where: { slug },
    create: {
      slug,
      name: builderCategories[slug].name,
      sortOrder: builderCategories[slug].sortOrder,
    },
    update: {},
  })

// Inserts the parts (with their categories, and one brand) and returns each
// part's database id by its seed id. Call resetCatalog() first.
export async function insertParts(
  parts: readonly AnyBuildPart[],
  overrides: Record<string, Override> = {}
): Promise<Map<string, string>> {
  const brand = await ensureBrand()
  const ids = new Map<string, string>()
  for (const part of parts) {
    const category = await ensureCategory(part.category)
    const override = overrides[part.id] ?? {}
    const { id } = await db.product.create({
      data: {
        name: part.name,
        slug: part.id.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        sku: part.id,
        price: override.price ?? 100_000,
        stock: override.stock ?? 10,
        lowStockAt: 5,
        preorderShipsOn: override.preorderShipsOn
          ? new Date(override.preorderShipsOn)
          : null,
        status: override.status ?? "ACTIVE",
        specs: part.specs as object,
        weightGrams: 100,
        categoryId: category.id,
        brandId: brand.id,
      },
      select: { id: true },
    })
    ids.set(part.id, id)
  }
  return ids
}

// `count` more active products shaped like `part` (same category and specs),
// for builds that need many different drives. Returns their database ids.
export async function insertCopies(
  part: AnyBuildPart,
  count: number
): Promise<string[]> {
  const category = await ensureCategory(part.category)
  const brand = await ensureBrand()
  const ids: string[] = []
  for (let index = 0; index < count; index++) {
    const { id } = await db.product.create({
      data: {
        name: `${part.name} copy ${index}`,
        slug: `copy-${part.category}-${index}`,
        sku: `COPY-${part.category}-${index}`,
        price: 100_000,
        stock: 10,
        status: "ACTIVE",
        specs: part.specs as object,
        weightGrams: 100,
        categoryId: category.id,
        brandId: brand.id,
      },
      select: { id: true },
    })
    ids.push(id)
  }
  return ids
}

// A build's items with the database ids in place of the seed ids
export function itemsWithIds(
  build: Build,
  ids: ReadonlyMap<string, string>
): BuildItem[] {
  return toBuildItems(build).map((item) => ({
    ...item,
    productId: ids.get(item.productId)!,
  }))
}

// Every part of a build, once
export function partsOfBuild(build: Build): AnyBuildPart[] {
  return Object.values(build).flatMap((entries) =>
    (entries ?? []).map((entry) => entry.part as AnyBuildPart)
  )
}

// A well-formed product id that no product has
export const UNKNOWN_PRODUCT_ID = "ckunknownproduct000000000"
