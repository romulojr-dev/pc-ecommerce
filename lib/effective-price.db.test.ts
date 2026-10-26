import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createCategoryAndBrand, db, resetCatalog } from "@/test-support/db"

// The trigger that keeps Product.effectivePrice at COALESCE(salePrice, price)
// (docs/adr/0004). Centavos throughout.

let categoryId: string
let brandId: string

beforeEach(async () => {
  await resetCatalog()
  ;({ categoryId, brandId } = await createCategoryAndBrand())
})

afterAll(() => db.$disconnect())

let counter = 0
function createProduct(data: {
  price: number
  salePrice?: number | null
  effectivePrice?: number
}) {
  counter += 1
  return db.product.create({
    data: {
      name: `Part ${counter}`,
      slug: `part-${counter}`,
      sku: `SKU-${counter}`,
      specs: {},
      weightGrams: 100,
      categoryId,
      brandId,
      ...data,
    },
  })
}

const effectivePriceOf = async (id: string) =>
  (await db.product.findUniqueOrThrow({ where: { id } })).effectivePrice

describe("effectivePrice trigger", () => {
  it("is the price when there is no sale", async () => {
    const { id } = await createProduct({ price: 1_000_000 })
    expect(await effectivePriceOf(id)).toBe(1_000_000)
  })

  it("is the sale price on insert", async () => {
    const { id } = await createProduct({
      price: 1_000_000,
      salePrice: 900_000,
    })
    expect(await effectivePriceOf(id)).toBe(900_000)
  })

  it("follows the sale price when it is set and when it is cleared", async () => {
    const { id } = await createProduct({ price: 1_000_000 })

    await db.product.update({ where: { id }, data: { salePrice: 700_000 } })
    expect(await effectivePriceOf(id)).toBe(700_000)

    await db.product.update({ where: { id }, data: { salePrice: null } })
    expect(await effectivePriceOf(id)).toBe(1_000_000)
  })

  it("follows the price when the product is not on sale, not when it is", async () => {
    const { id } = await createProduct({ price: 1_000_000 })

    await db.product.update({ where: { id }, data: { price: 1_200_000 } })
    expect(await effectivePriceOf(id)).toBe(1_200_000)

    await db.product.update({ where: { id }, data: { salePrice: 800_000 } })
    await db.product.update({ where: { id }, data: { price: 1_500_000 } })
    expect(await effectivePriceOf(id)).toBe(800_000)
  })

  it("overrides a value the app sends (ADR 0004: the app never writes it)", async () => {
    const { id } = await createProduct({ price: 1_000_000, effectivePrice: 1 })
    expect(await effectivePriceOf(id)).toBe(1_000_000)

    await db.product.update({ where: { id }, data: { effectivePrice: 2 } })
    expect(await effectivePriceOf(id)).toBe(1_000_000)
  })

  it("is not changed by updating other columns", async () => {
    const { id } = await createProduct({
      price: 1_000_000,
      salePrice: 900_000,
    })
    await db.product.update({ where: { id }, data: { stock: 7 } })
    expect(await effectivePriceOf(id)).toBe(900_000)
  })
})
