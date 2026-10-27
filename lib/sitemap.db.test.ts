import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { loadSitemapData } from "@/lib/sitemap"
import { db, resetCatalog } from "@/test-support/db"

// What sitemap.xml lists (docs/specs/017-seo). Each test builds its own
// catalog: CPU (first), GPU, an always empty Case, and one brand.

let cpuId: string
let gpuId: string
let brandId: string

beforeEach(async () => {
  await resetCatalog()
  ;[{ id: cpuId }, { id: gpuId }, , { id: brandId }] = await Promise.all([
    db.category.create({ data: { name: "CPU", slug: "cpu", sortOrder: 1 } }),
    db.category.create({ data: { name: "GPU", slug: "gpu", sortOrder: 2 } }),
    db.category.create({ data: { name: "Case", slug: "case", sortOrder: 3 } }),
    db.brand.create({ data: { name: "Alpha", slug: "alpha" } }),
  ])
})

afterAll(() => db.$disconnect())

async function insert(
  name: string,
  categoryId: string,
  {
    status = "ACTIVE",
    updatedAt,
  }: { status?: "ACTIVE" | "DRAFT"; updatedAt?: string } = {}
) {
  const slug = name.toLowerCase().replace(/\W+/g, "-")
  const { id } = await db.product.create({
    data: {
      name,
      slug,
      sku: `SKU-${slug}`,
      price: 100_000,
      stock: 10,
      status,
      specs: {},
      weightGrams: 100,
      categoryId,
      brandId,
    },
    select: { id: true },
  })
  // An explicit value overrides @updatedAt
  if (updatedAt) {
    await db.product.update({
      where: { id },
      data: { updatedAt: new Date(updatedAt) },
    })
  }
}

const setCategoryUpdatedAt = (id: string, updatedAt: string) =>
  db.category.update({
    where: { id },
    data: { updatedAt: new Date(updatedAt) },
  })

describe("loadSitemapData", () => {
  it("lists active products only, by category order then name", async () => {
    await insert("GPU One", gpuId)
    await insert("CPU B", cpuId)
    await insert("CPU A", cpuId)
    await insert("CPU Draft", cpuId, { status: "DRAFT" })

    const { products } = await loadSitemapData()
    expect(
      products.map(({ categorySlug, slug }) => [categorySlug, slug])
    ).toEqual([
      ["cpu", "cpu-a"],
      ["cpu", "cpu-b"],
      ["gpu", "gpu-one"],
    ])
  })

  it("lists only categories with an active product", async () => {
    await insert("CPU A", cpuId)
    // GPU has only a draft, Case has nothing
    await insert("GPU Draft", gpuId, { status: "DRAFT" })

    const { categories } = await loadSitemapData()
    expect(categories.map(({ slug }) => slug)).toEqual(["cpu"])
  })

  it("leaves out child categories", async () => {
    const { id: childId } = await db.category.create({
      data: { name: "AM5 CPU", slug: "am5-cpu", parentId: cpuId },
    })
    await insert("CPU A", cpuId)
    await insert("AM5 A", childId)

    const { categories } = await loadSitemapData()
    expect(categories.map(({ slug }) => slug)).toEqual(["cpu"])
  })

  it("uses each product's updatedAt", async () => {
    await insert("CPU A", cpuId, { updatedAt: "2026-09-01T00:00:00.000Z" })

    const { products } = await loadSitemapData()
    expect(products[0].lastModified).toBe("2026-09-01T00:00:00.000Z")
  })

  it("dates a category by its newest product when that is newer", async () => {
    await insert("CPU A", cpuId, { updatedAt: "2026-09-01T00:00:00.000Z" })
    await insert("CPU B", cpuId, { updatedAt: "2026-10-01T00:00:00.000Z" })
    // A draft's change doesn't count: it isn't on the page
    await insert("CPU Draft", cpuId, {
      status: "DRAFT",
      updatedAt: "2026-10-20T00:00:00.000Z",
    })
    await setCategoryUpdatedAt(cpuId, "2026-08-01T00:00:00.000Z")

    const { categories } = await loadSitemapData()
    expect(categories[0].lastModified).toBe("2026-10-01T00:00:00.000Z")
  })

  it("dates a category by its own change when that is newer", async () => {
    await insert("CPU A", cpuId, { updatedAt: "2026-09-01T00:00:00.000Z" })
    await setCategoryUpdatedAt(cpuId, "2026-10-15T00:00:00.000Z")

    const { categories } = await loadSitemapData()
    expect(categories[0].lastModified).toBe("2026-10-15T00:00:00.000Z")
  })

  it("dates the home page by the newest active product", async () => {
    await insert("CPU A", cpuId, { updatedAt: "2026-09-01T00:00:00.000Z" })
    await insert("GPU One", gpuId, { updatedAt: "2026-10-05T00:00:00.000Z" })

    const { homeModified } = await loadSitemapData()
    expect(homeModified).toBe("2026-10-05T00:00:00.000Z")
  })

  it("is empty, with no home date, when there are no active products", async () => {
    await insert("CPU Draft", cpuId, { status: "DRAFT" })

    expect(await loadSitemapData()).toEqual({
      homeModified: null,
      categories: [],
      products: [],
    })
  })
})
