import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { getBuilderParts } from "@/lib/builder-parts"
import {
  createCategoryAndBrand,
  db,
  FIXTURE_TODAY,
  resetCatalog,
} from "@/test-support/db"
import { seed } from "@/test-support/seed-parts"

// The builder's parts, loaded by id (docs/specs/020-builder-page, "Loading
// parts"): active products only, with current prices, stock status and valid
// specs. Each test inserts the Ryzen 5 7600's seed specs into a "cpu"
// category.

let categoryId: string
let brandId: string

beforeEach(async () => {
  await resetCatalog()
  ;({ categoryId, brandId } = await createCategoryAndBrand())
})

afterAll(() => db.$disconnect())

type Fixture = {
  name: string
  // Pesos
  price?: number
  salePrice?: number
  stock?: number
  status?: "ACTIVE" | "DRAFT"
  preorderShipsOn?: string
  specs?: object
}

async function insert(product: Fixture) {
  const slug = product.name.toLowerCase().replaceAll(" ", "-")
  const { id } = await db.product.create({
    data: {
      name: product.name,
      slug,
      sku: `SKU-${slug}`,
      price: (product.price ?? 11_495) * 100,
      salePrice: product.salePrice && product.salePrice * 100,
      stock: product.stock ?? 12,
      lowStockAt: 5,
      preorderShipsOn: product.preorderShipsOn
        ? new Date(product.preorderShipsOn)
        : null,
      status: product.status ?? "ACTIVE",
      specs: product.specs ?? seed.ryzen5_7600.specs,
      weightGrams: 450,
      categoryId,
      brandId,
    },
    select: { id: true },
  })
  return id
}

const load = (ids: string[]) => getBuilderParts(ids, FIXTURE_TODAY)

describe("getBuilderParts", () => {
  it("returns a part with what the engine and a slot row need", async () => {
    const id = await insert({ name: "Ryzen 5 7600" })
    await db.productImage.create({
      data: { productId: id, url: "/images/cpu.png", alt: "CPU", sortOrder: 0 },
    })

    expect(await load([id])).toEqual([
      {
        part: {
          id,
          name: "Ryzen 5 7600",
          category: "cpu",
          specs: seed.ryzen5_7600.specs,
        },
        slug: "ryzen-5-7600",
        brand: "Alpha",
        price: 1_149_500,
        salePrice: null,
        effectivePrice: 1_149_500,
        stock: 12,
        stockStatus: "in-stock",
        image: { url: "/images/cpu.png", alt: "CPU" },
      },
    ])
  })

  it("gives the sale price as the effective price (E4)", async () => {
    const id = await insert({
      name: "Ryzen 5 7600X",
      price: 12_495,
      salePrice: 10_995,
    })
    const [part] = await load([id])
    expect(part).toMatchObject({
      price: 1_249_500,
      salePrice: 1_099_500,
      effectivePrice: 1_099_500,
    })
  })

  it("leaves out ids no product has (E38)", async () => {
    const id = await insert({ name: "Ryzen 5 7600" })
    const parts = await load([id, "cm0000000000000000000000000"])
    expect(parts.map((data) => data.part.id)).toEqual([id])
  })

  it("leaves out products that aren't active (E39, E49)", async () => {
    const active = await insert({ name: "Active" })
    const draft = await insert({ name: "Draft", status: "DRAFT" })
    const parts = await load([active, draft])
    expect(parts.map((data) => data.part.id)).toEqual([active])
  })

  it("leaves out a product whose specs don't validate", async () => {
    const valid = await insert({ name: "Valid" })
    const invalid = await insert({ name: "Invalid", specs: { socket: "AM5" } })
    const parts = await load([valid, invalid])
    expect(parts.map((data) => data.part.id)).toEqual([valid])
  })

  it("leaves out a product outside the builder categories", async () => {
    const other = await db.category.create({
      data: { name: "Monitor", slug: "monitor" },
      select: { id: true },
    })
    const { id } = await db.product.create({
      data: {
        name: "Monitor",
        slug: "monitor",
        sku: "SKU-monitor",
        price: 1_000_000,
        stock: 5,
        specs: {},
        weightGrams: 4000,
        status: "ACTIVE",
        categoryId: other.id,
        brandId,
      },
      select: { id: true },
    })
    expect(await load([id])).toEqual([])
  })

  it.each([
    { stock: 12, expected: "in-stock" },
    { stock: 4, expected: "low-stock" },
    { stock: 0, expected: "out-of-stock" },
    { stock: 6, preorderShipsOn: "2027-02-01", expected: "pre-order" },
  ])(
    "gives stock $stock as $expected (E7, E8, E36)",
    async ({ expected, ...fixture }) => {
      const id = await insert({ name: "Part", ...fixture })
      const [part] = await load([id])
      expect(part.stockStatus).toBe(expected)
    }
  )

  it("reads the current price on every call (E46, E55)", async () => {
    const id = await insert({ name: "Ryzen 5 7600" })
    expect((await load([id]))[0].effectivePrice).toBe(1_149_500)

    await db.product.update({ where: { id }, data: { price: 999_900 } })
    expect((await load([id]))[0].effectivePrice).toBe(999_900)
  })

  it("returns no image when the product has none", async () => {
    const id = await insert({ name: "Ryzen 5 7600" })
    expect((await load([id]))[0].image).toBeNull()
  })
})
