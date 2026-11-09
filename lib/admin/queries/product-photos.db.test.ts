import { afterAll, beforeEach, describe, expect, test } from "vitest"

import { db } from "@/lib/db"
import { resetCatalog } from "@/test-support/db"

import { DEFAULT_PRODUCT_PARAMS } from "../products-params"
import { QueryDeniedError } from "./guard"
import {
  getProductForEdit,
  listProducts,
  nextProductWithoutPhotos,
} from "./products"

// docs/specs/049-product-images-upload, B8, B23, B24, E33–E36: the list's
// photo filter and thumbnails, the edit read's photos, and the next product
// without photos

const BASE = "https://abc123.public.blob.vercel-storage.com/products"
let ids: Record<string, string> = {}

async function product(
  name: string,
  categoryId: string,
  brandId: string,
  updatedAt: string
) {
  const row = await db.product.create({
    data: {
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      sku: name.toUpperCase().replace(/[^A-Z0-9]+/g, "-"),
      specs: {},
      price: 1_000_000,
      weightGrams: 500,
      stock: 5,
      categoryId,
      brandId,
    },
  })
  // updatedAt is set by the column default and @updatedAt; pin it so the
  // list order is known
  await db.$executeRaw`UPDATE "Product" SET "updatedAt" = ${new Date(updatedAt)} WHERE "id" = ${row.id}`
  return row.id
}

beforeEach(async () => {
  await resetCatalog()
  const cpu = await db.category.create({ data: { name: "CPU", slug: "cpu" } })
  const gpu = await db.category.create({
    data: { name: "Graphics Card", slug: "gpu" },
  })
  const brand = await db.brand.create({ data: { name: "AMD", slug: "amd" } })
  // Newest first in the list: Alpha, Bravo, Charlie, Delta
  ids = {
    alpha: await product("Alpha", cpu.id, brand.id, "2026-11-04T00:00:00Z"),
    bravo: await product("Bravo", cpu.id, brand.id, "2026-11-03T00:00:00Z"),
    charlie: await product("Charlie", gpu.id, brand.id, "2026-11-02T00:00:00Z"),
    delta: await product("Delta", gpu.id, brand.id, "2026-11-01T00:00:00Z"),
  }
  // Bravo has two photos; the others none
  await db.productImage.createMany({
    data: [
      { productId: ids.bravo, url: `${BASE}/b2.webp`, alt: "B2", sortOrder: 1 },
      { productId: ids.bravo, url: `${BASE}/b1.webp`, alt: "B1", sortOrder: 0 },
    ],
  })
})
afterAll(() => db.$disconnect())

const names = async (params = DEFAULT_PRODUCT_PARAMS) =>
  (await listProducts("owner", params)).rows.map((row) => row.name)

describe("the photos filter", () => {
  test("E33: 'No photos yet' lists only products with no photo of their own", async () => {
    expect(
      await names({ ...DEFAULT_PRODUCT_PARAMS, photos: "missing" })
    ).toEqual(["Alpha", "Charlie", "Delta"])
  })

  test("any is the whole list", async () => {
    expect(await names()).toEqual(["Alpha", "Bravo", "Charlie", "Delta"])
  })

  test("it combines with category and counts in the total", async () => {
    const result = await listProducts("owner", {
      ...DEFAULT_PRODUCT_PARAMS,
      photos: "missing",
      category: "gpu",
    })
    expect(result.rows.map((row) => row.name)).toEqual(["Charlie", "Delta"])
    expect(result.total).toBe(2)
  })

  test("a product returns to the filter when its last photo is removed (E26)", async () => {
    await db.productImage.deleteMany({ where: { productId: ids.bravo } })
    expect(
      await names({ ...DEFAULT_PRODUCT_PARAMS, photos: "missing" })
    ).toEqual(["Alpha", "Bravo", "Charlie", "Delta"])
  })

  test("the filter applies to Demo too (products hold no customer data)", async () => {
    const result = await listProducts("demo", {
      ...DEFAULT_PRODUCT_PARAMS,
      photos: "missing",
    })
    expect(result.total).toBe(3)
  })
})

describe("list rows", () => {
  test("a row's image is its main photo, or its category placeholder", async () => {
    const rows = (await listProducts("owner", DEFAULT_PRODUCT_PARAMS)).rows
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]))
    expect(byName.Bravo.image).toEqual({ url: `${BASE}/b1.webp`, alt: "B1" })
    expect(byName.Bravo.hasPhotos).toBe(true)
    expect(byName.Alpha.image).toEqual({
      url: "/images/placeholders/cpu.svg",
      alt: "Alpha",
    })
    expect(byName.Alpha.hasPhotos).toBe(false)
    expect(byName.Charlie.image?.url).toBe("/images/placeholders/gpu.svg")
  })
})

describe("the edit read", () => {
  test("lists the product's photos in order, with the category name", async () => {
    const product = await getProductForEdit("owner", ids.bravo)
    expect(product?.images.map((image) => image.alt)).toEqual(["B1", "B2"])
    expect(product?.images[0]).toMatchObject({ url: `${BASE}/b1.webp` })
    expect(product?.categoryName).toBe("CPU")
  })

  test("a product without photos has an empty list", async () => {
    expect((await getProductForEdit("owner", ids.alpha))?.images).toEqual([])
  })
})

describe("nextProductWithoutPhotos", () => {
  test("E34: the first product without photos in the list's order, not the current one", async () => {
    expect(await nextProductWithoutPhotos("owner", ids.alpha)).toEqual({
      id: ids.charlie,
      name: "Charlie",
    })
    expect(await nextProductWithoutPhotos("owner", ids.charlie)).toEqual({
      id: ids.alpha,
      name: "Alpha",
    })
  })

  test("a product that has photos is never offered", async () => {
    const next = await nextProductWithoutPhotos("owner", ids.alpha)
    expect(next?.id).not.toBe(ids.bravo)
  })

  test("E35: none left once every other product has a photo", async () => {
    for (const key of ["charlie", "delta"]) {
      await db.productImage.create({
        data: {
          productId: ids[key],
          url: `${BASE}/${key}.webp`,
          alt: key,
          sortOrder: 0,
        },
      })
    }
    // Alpha is the only one left, and it is the current product
    expect(await nextProductWithoutPhotos("owner", ids.alpha)).toBeNull()
  })

  test("the current product is excluded even while it has no photo yet", async () => {
    const next = await nextProductWithoutPhotos("owner", ids.delta)
    expect(next?.id).not.toBe(ids.delta)
  })

  test("D13: a photo change does not move a product in the queue", async () => {
    const before = await nextProductWithoutPhotos("owner", ids.alpha)
    await db.productImage.create({
      data: {
        productId: ids.delta,
        url: `${BASE}/d.webp`,
        alt: "D",
        sortOrder: 0,
      },
    })
    await db.productImage.deleteMany({ where: { productId: ids.delta } })
    expect(await nextProductWithoutPhotos("owner", ids.alpha)).toEqual(before)
  })

  test("Staff has no Products screen: the read is refused", async () => {
    await expect(nextProductWithoutPhotos("staff", ids.alpha)).rejects.toThrow(
      QueryDeniedError
    )
  })
})
