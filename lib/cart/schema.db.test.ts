import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { shareBuild } from "@/lib/build-share"
import { db, FIXTURE_TODAY, resetCatalog } from "@/test-support/db"
import {
  insertParts,
  itemsWithIds,
  partsOfBuild,
} from "@/test-support/build-fixtures"
import { buildA, seed } from "@/test-support/seed-parts"

// The cart tables (docs/specs/025-cart-single-items, Rules › Concurrency,
// › Data and › Schema and migrations stay in step): what the database itself
// guarantees, whatever the app does.

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

const CART = "cart-schema-test-0000"

async function setup() {
  const parts = partsOfBuild(buildA())
  const ids = await insertParts(parts)
  await db.cart.create({ data: { id: CART } })
  const result = await shareBuild(itemsWithIds(buildA(), ids), {
    today: FIXTURE_TODAY,
  })
  if (!result.ok) throw new Error("could not share build A")
  const { id: buildId } = await db.build.findFirstOrThrow({
    where: { shareSlug: result.slug },
    select: { id: true },
  })
  return { ids, buildId, ryzen: ids.get(seed.ryzen5_7600.id)! }
}

const line = (productId: string, quantity = 1, buildId: string | null = null) =>
  db.cartItem.create({ data: { cartId: CART, productId, quantity, buildId } })

describe("indexes", () => {
  it("has the partial unique index for single items and the build-group index", async () => {
    const rows = await db.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'CartItem' AND indexname LIKE '%_key'
      ORDER BY indexname`

    const defs = Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef]))
    expect(defs["CartItem_cartId_productId_key"]).toMatch(
      /UNIQUE INDEX .* \("cartId", "productId"\) WHERE \("buildId" IS NULL\)/
    )
    expect(defs["CartItem_cartId_productId_buildId_key"]).toMatch(
      /UNIQUE INDEX .* \("cartId", "productId", "buildId"\)$/
    )
  })
})

describe("CartItem", () => {
  it("refuses a second single line for the same product in a cart", async () => {
    const { ryzen } = await setup()
    await line(ryzen)

    await expect(line(ryzen)).rejects.toMatchObject({ code: "P2002" })
    expect(await db.cartItem.count()).toBe(1)
  })

  it("allows the same product in another cart, and as a build group line", async () => {
    const { ryzen, buildId } = await setup()
    await db.cart.create({ data: { id: "cart-schema-other-0000" } })
    await line(ryzen)
    await db.cartItem.create({
      data: { cartId: "cart-schema-other-0000", productId: ryzen, quantity: 1 },
    })

    await line(ryzen, 1, buildId)

    expect(await db.cartItem.count()).toBe(3)
  })

  it("refuses the same product twice in one build group", async () => {
    const { ryzen, buildId } = await setup()
    await line(ryzen, 1, buildId)

    await expect(line(ryzen, 1, buildId)).rejects.toMatchObject({
      code: "P2002",
    })
  })

  it("refuses a quantity below 1", async () => {
    const { ryzen } = await setup()

    await expect(line(ryzen, 0)).rejects.toThrow()
    await expect(line(ryzen, -1)).rejects.toThrow()
    expect(await db.cartItem.count()).toBe(0)
  })

  it("refuses to delete a product that is in a cart", async () => {
    const { ryzen } = await setup()
    await line(ryzen)

    await expect(db.product.delete({ where: { id: ryzen } })).rejects.toThrow()

    expect(await db.product.count({ where: { id: ryzen } })).toBe(1)
  })

  it("refuses to delete a build that is in a cart", async () => {
    const { ryzen, buildId } = await setup()
    await line(ryzen, 1, buildId)

    await expect(db.build.delete({ where: { id: buildId } })).rejects.toThrow()
  })

  it("deletes a cart's lines with the cart", async () => {
    const { ryzen } = await setup()
    await line(ryzen)

    await db.cart.delete({ where: { id: CART } })

    expect(await db.cartItem.count()).toBe(0)
  })
})

describe("reset", () => {
  it("empties carts too: CASCADE from Product alone would leave them behind", async () => {
    const { ryzen } = await setup()
    await line(ryzen)

    await resetCatalog()

    expect(await db.cart.count()).toBe(0)
    expect(await db.cartItem.count()).toBe(0)
  })
})
