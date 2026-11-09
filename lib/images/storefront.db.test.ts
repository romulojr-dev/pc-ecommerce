import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { addToCart, getCartView } from "@/lib/cart/cart"
import { singleLines } from "@/lib/cart/types"
import { getCategoryProducts, getProductPage } from "@/lib/products"
import { insertParts } from "@/test-support/build-fixtures"
import { db, FIXTURE_TODAY, resetCatalog } from "@/test-support/db"
import { seed } from "@/test-support/seed-parts"

// What each storefront read shows for a product with and without photos
// (docs/specs/049-product-images-upload, B18–B21, E26, E30)

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

// insertParts slugs a product by its part id
const SLUG = seed.ryzen5_7600.id.toLowerCase().replace(/[^a-z0-9]+/g, "-")
const BASE = "https://abc123.public.blob.vercel-storage.com/products"

async function ryzen() {
  const ids = await insertParts([seed.ryzen5_7600])
  return ids.get(seed.ryzen5_7600.id)!
}

async function addPhotos(productId: string, count: number) {
  await db.productImage.createMany({
    data: Array.from({ length: count }, (_, n) => ({
      productId,
      url: `${BASE}/p${n}.webp`,
      alt: `Photo ${n}`,
      sortOrder: n,
    })),
  })
}

describe("the product page", () => {
  it("E30: without photos, the placeholder alone, flagged as one", async () => {
    await ryzen()
    const page = await getProductPage(SLUG)
    expect(page?.placeholder).toBe(true)
    expect(page?.images).toEqual([
      { url: "/images/placeholders/cpu.svg", alt: seed.ryzen5_7600.name },
    ])
  })

  it("E1, E2: with photos, those in order and no placeholder", async () => {
    const id = await ryzen()
    await addPhotos(id, 3)
    const page = await getProductPage(SLUG)
    expect(page?.placeholder).toBe(false)
    expect(page?.images.map((image) => image.url)).toEqual([
      `${BASE}/p0.webp`,
      `${BASE}/p1.webp`,
      `${BASE}/p2.webp`,
    ])
  })

  it("E26: removing the last photo brings the placeholder back", async () => {
    const id = await ryzen()
    await addPhotos(id, 1)
    await db.productImage.deleteMany({ where: { productId: id } })
    const page = await getProductPage(SLUG)
    expect(page?.placeholder).toBe(true)
  })
})

describe("listing cards", () => {
  async function cardImage() {
    const category = await db.category.findUniqueOrThrow({
      where: { slug: "cpu" },
    })
    const { products } = await getCategoryProducts(
      { id: category.id, slug: "cpu" },
      { sort: "price-asc", page: 1, filters: {} },
      { today: FIXTURE_TODAY }
    )
    return products[0].image
  }

  it("E30: the category placeholder when there is no photo", async () => {
    await ryzen()
    expect(await cardImage()).toEqual({
      url: "/images/placeholders/cpu.svg",
      alt: seed.ryzen5_7600.name,
    })
  })

  it("the first photo when there is one", async () => {
    const id = await ryzen()
    await addPhotos(id, 2)
    expect(await cardImage()).toEqual({
      url: `${BASE}/p0.webp`,
      alt: "Photo 0",
    })
  })
})

describe("the cart", () => {
  async function lineImage() {
    const id = await ryzen()
    const { cartId } = await addToCart(
      { productId: id, quantity: 1 },
      { cartId: null, today: FIXTURE_TODAY }
    )
    const view = await getCartView(cartId, FIXTURE_TODAY)
    return singleLines(view)[0].image
  }

  it("E30: a single line shows the placeholder without photos", async () => {
    expect(await lineImage()).toEqual({
      url: "/images/placeholders/cpu.svg",
      alt: seed.ryzen5_7600.name,
    })
  })

  it("E31: and the photo with one", async () => {
    const id = await ryzen()
    await addPhotos(id, 1)
    const { cartId } = await addToCart(
      { productId: id, quantity: 1 },
      { cartId: null, today: FIXTURE_TODAY }
    )
    const view = await getCartView(cartId, FIXTURE_TODAY)
    expect(singleLines(view)[0].image?.url).toBe(`${BASE}/p0.webp`)
  })
})
