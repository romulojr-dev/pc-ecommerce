import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { getRelatedProducts } from "@/lib/products"
import { createCategoryAndBrand, db, resetCatalog } from "@/test-support/db"

// Which products "Similar products" shows (docs/specs/015-related-products):
// same category, active, not the product itself; available (pre-orders
// included) before out of stock; then closest in effective price, ties to
// the cheaper one, then name. Each test builds its own catalog around
// "Current" at ₱10,000.

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
  price: number
  salePrice?: number
  stock?: number
  status?: "ACTIVE" | "DRAFT"
  preorderShipsOn?: string
  categoryId?: string
}

async function insert(product: Fixture) {
  const slug = product.name.toLowerCase()
  return db.product.create({
    data: {
      name: product.name,
      slug,
      sku: `SKU-${slug}`,
      price: product.price * 100,
      salePrice: product.salePrice && product.salePrice * 100,
      stock: product.stock ?? 10,
      lowStockAt: 5,
      preorderShipsOn: product.preorderShipsOn
        ? new Date(product.preorderShipsOn)
        : null,
      status: product.status ?? "ACTIVE",
      specs: {},
      weightGrams: 100,
      categoryId: product.categoryId ?? categoryId,
      brandId,
    },
    // effectivePrice comes from the trigger (ADR 0004)
    select: { id: true, categoryId: true, effectivePrice: true },
  })
}

// Inserts "Current" at ₱10,000 and the others, then returns the names
// related to Current, in order
async function related(others: Fixture[]) {
  const current = await insert({ name: "Current", price: 10_000 })
  for (const other of others) await insert(other)
  const products = await getRelatedProducts(current)
  return products.map((product) => product.name)
}

describe("getRelatedProducts", () => {
  it("returns the 4 closest in price, nearest first", async () => {
    expect(
      await related([
        { name: "P4000", price: 4_000 },
        { name: "P8000", price: 8_000 },
        { name: "P9500", price: 9_500 },
        { name: "P11000", price: 11_000 },
        { name: "P13000", price: 13_000 },
        { name: "P20000", price: 20_000 },
      ])
    ).toEqual(["P9500", "P11000", "P8000", "P13000"])
  })

  it("measures a product on sale at its sale price", async () => {
    expect(
      await related([
        { name: "Listed", price: 11_000 },
        { name: "OnSale", price: 15_000, salePrice: 10_500 },
      ])
    ).toEqual(["OnSale", "Listed"])
  })

  it("never returns the product itself", async () => {
    expect(
      await related([
        { name: "A", price: 9_000 },
        { name: "B", price: 11_000 },
        { name: "C", price: 12_000 },
      ])
    ).toEqual(["A", "B", "C"])
  })

  it("leaves out products that aren't active", async () => {
    expect(
      await related([
        { name: "Draft", price: 10_000, status: "DRAFT" },
        { name: "Active", price: 12_000 },
      ])
    ).toEqual(["Active"])
  })

  it("leaves out other categories", async () => {
    const { id: gpuId } = await db.category.create({
      data: { name: "GPU", slug: "gpu" },
    })
    expect(
      await related([
        { name: "Gpu", price: 10_000, categoryId: gpuId },
        { name: "Cpu", price: 12_000 },
      ])
    ).toEqual(["Cpu"])
  })

  it("puts available products before an out-of-stock one", async () => {
    expect(
      await related([
        { name: "Sold", price: 10_000, stock: 0 },
        { name: "P15000", price: 15_000 },
        { name: "P20000", price: 20_000 },
        { name: "P30000", price: 30_000 },
        { name: "P40000", price: 40_000 },
      ])
    ).toEqual(["P15000", "P20000", "P30000", "P40000"])
  })

  it("fills the last slot with an out-of-stock product", async () => {
    expect(
      await related([
        { name: "Sold", price: 10_000, stock: 0 },
        { name: "P15000", price: 15_000 },
        { name: "P20000", price: 20_000 },
        { name: "P30000", price: 30_000 },
      ])
    ).toEqual(["P15000", "P20000", "P30000", "Sold"])
  })

  it("counts pre-orders as available", async () => {
    expect(
      await related([
        { name: "Sold", price: 10_000, stock: 0 },
        {
          name: "Preorder",
          price: 10_100,
          stock: 5,
          preorderShipsOn: "2099-01-15",
        },
        { name: "P12000", price: 12_000 },
      ])
    ).toEqual(["Preorder", "P12000", "Sold"])
  })

  it("breaks equal distances by the cheaper one, then by name", async () => {
    expect(
      await related([
        { name: "B", price: 9_000 },
        { name: "A", price: 11_000 },
        { name: "A2", price: 9_000 },
      ])
    ).toEqual(["A2", "B", "A"])
  })

  it("returns nothing when the product is alone in its category", async () => {
    expect(await related([])).toEqual([])
  })
})
