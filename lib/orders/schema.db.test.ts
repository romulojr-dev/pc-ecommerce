import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { shareBuild } from "@/lib/build-share"
import { newCartId } from "@/lib/cart/id"
import {
  insertParts,
  itemsWithIds,
  partsOfBuild,
} from "@/test-support/build-fixtures"
import { db, FIXTURE_TODAY, resetCatalog } from "@/test-support/db"
import { orderData, pickupOrderData } from "@/test-support/orders"
import { buildA, seed } from "@/test-support/seed-parts"

// What the database itself guarantees for orders (docs/specs/030-place-an-
// order): S1–S6 and the search trigger, T1–T4. Whatever the app does, these
// hold.

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

async function setup() {
  const ids = await insertParts(partsOfBuild(buildA()))
  const shared = await shareBuild(itemsWithIds(buildA(), ids), {
    today: FIXTURE_TODAY,
  })
  if (!shared.ok) throw new Error("could not share build A")
  const { id: buildId } = await db.build.findFirstOrThrow({
    where: { shareSlug: shared.slug },
    select: { id: true },
  })
  return { ids, buildId, ryzen: ids.get(seed.ryzen5_7600.id)! }
}

const item = (
  orderId: string,
  productId: string,
  extra: Partial<{
    quantity: number
    buildId: string | null
    slot: string | null
    priceSnapshot: number
    position: number
  }> = {}
) =>
  db.orderItem.create({
    data: {
      orderId,
      productId,
      nameSnapshot: "AMD Ryzen 5 7600",
      priceSnapshot: 1_149_500,
      quantity: 1,
      position: 0,
      ...extra,
    },
  })

describe("Product stock (S1)", () => {
  it("refuses a negative stock", async () => {
    const { ryzen } = await setup()

    await expect(
      db.product.update({ where: { id: ryzen }, data: { stock: -1 } })
    ).rejects.toThrow()
    await expect(
      db.$executeRaw`UPDATE "Product" SET "stock" = "stock" - 11 WHERE "id" = ${ryzen}`
    ).rejects.toThrow()

    expect(
      (await db.product.findUniqueOrThrow({ where: { id: ryzen } })).stock
    ).toBe(10)
  })

  it("allows zero", async () => {
    const { ryzen } = await setup()
    await db.product.update({ where: { id: ryzen }, data: { stock: 0 } })
  })
})

describe("Order (S2, S4)", () => {
  it("takes a delivery order and a pickup order", async () => {
    await db.order.create({ data: orderData() })
    await db.order.create({ data: pickupOrderData() })
    expect(await db.order.count()).toBe(2)
  })

  it("starts as Pending payment with no discount", async () => {
    const order = await db.order.create({ data: orderData() })
    expect(order.status).toBe("PENDING_PAYMENT")
    expect(order.discount).toBe(0)
  })

  it.each([
    ["a negative subtotal", { subtotal: -1, total: 11_999 }],
    ["a negative shipping fee", { shippingFee: -1, total: 2_298_999 }],
    ["a negative discount", { discount: -1, total: 2_311_001 }],
    ["a total that doesn't add up", { total: 2_311_001 }],
    ["a negative weight", { weightGrams: -1 }],
  ])("refuses %s", async (_name, change) => {
    await expect(db.order.create({ data: orderData(change) })).rejects.toThrow()
  })

  it("adds a discount into the total", async () => {
    await db.order.create({
      data: orderData({ discount: 100_000, total: 2_211_000 }),
    })
  })

  it.each([
    ["a delivery with no address", { street: null }],
    ["a delivery with no region", { regionCode: null }],
    ["a delivery with no barangay", { barangayName: null }],
    ["a delivery with no zone", { zone: null }],
    ["a delivery with no PSGC version", { psgcVersion: null }],
  ])("refuses %s", async (_name, change) => {
    await expect(db.order.create({ data: orderData(change) })).rejects.toThrow()
  })

  it("lets a delivery order have no province code", async () => {
    await db.order.create({
      data: orderData({
        provinceCode: null,
        provinceName: "Cebu",
        provinceIsGeographic: true,
      }),
    })
    await db.order.create({
      data: orderData({
        provinceCode: "0105500000",
        provinceName: "Pangasinan",
      }),
    })
  })

  it.each([
    ["an address", { street: "12 Mabini St" }],
    ["a zone", { zone: "METRO_MANILA" as const }],
    ["a province", { provinceName: "Metro Manila" }],
    ["a geographic province flag", { provinceIsGeographic: true }],
  ])("refuses a pickup order with %s", async (_name, change) => {
    await expect(
      db.order.create({ data: pickupOrderData(change) })
    ).rejects.toThrow()
  })

  it("keeps the order number, token hash and idempotency key unique", async () => {
    const first = orderData()
    await db.order.create({ data: first })

    for (const clash of [
      { orderNumber: first.orderNumber },
      { accessTokenHash: first.accessTokenHash },
      { idempotencyKey: first.idempotencyKey },
    ]) {
      await expect(
        db.order.create({ data: orderData(clash) })
      ).rejects.toMatchObject({ code: "P2002" })
    }
    expect(await db.order.count()).toBe(1)
  })
})

describe("OrderItem (S3)", () => {
  it("takes a single line and a build part", async () => {
    const { ryzen, buildId } = await setup()
    const { id } = await db.order.create({ data: orderData() })

    await item(id, ryzen, { quantity: 2 })
    await item(id, ryzen, { buildId, slot: "cpu", position: 1 })
    expect(await db.orderItem.count()).toBe(2)
  })

  it("refuses a quantity below one", async () => {
    const { ryzen } = await setup()
    const { id } = await db.order.create({ data: orderData() })
    await expect(item(id, ryzen, { quantity: 0 })).rejects.toThrow()
  })

  it("refuses a negative price or position", async () => {
    const { ryzen } = await setup()
    const { id } = await db.order.create({ data: orderData() })
    await expect(item(id, ryzen, { priceSnapshot: -1 })).rejects.toThrow()
    await expect(item(id, ryzen, { position: -1 })).rejects.toThrow()
  })

  it("needs a build and a slot together", async () => {
    const { ryzen, buildId } = await setup()
    const { id } = await db.order.create({ data: orderData() })
    await expect(item(id, ryzen, { buildId })).rejects.toThrow()
    await expect(item(id, ryzen, { slot: "cpu" })).rejects.toThrow()
  })

  it("refuses the same product twice as single lines, or twice in one build", async () => {
    const { ryzen, buildId } = await setup()
    const { id } = await db.order.create({ data: orderData() })

    await item(id, ryzen)
    await expect(item(id, ryzen)).rejects.toMatchObject({ code: "P2002" })

    await item(id, ryzen, { buildId, slot: "cpu" })
    await expect(
      item(id, ryzen, { buildId, slot: "cpu" })
    ).rejects.toMatchObject({ code: "P2002" })
  })

  it("allows the same product in two orders", async () => {
    const { ryzen } = await setup()
    const a = await db.order.create({ data: orderData() })
    const b = await db.order.create({ data: orderData() })
    await item(a.id, ryzen)
    await item(b.id, ryzen)
  })
})

describe("StockMovement", () => {
  it("takes a reservation and refuses a change of zero", async () => {
    const { ryzen } = await setup()
    const { id } = await db.order.create({ data: orderData() })

    await db.stockMovement.create({
      data: {
        productId: ryzen,
        change: -2,
        reason: "ORDER_RESERVED",
        orderId: id,
      },
    })
    await expect(
      db.stockMovement.create({
        data: { productId: ryzen, change: 0, reason: "ORDER_RESERVED" },
      })
    ).rejects.toThrow()
  })
})

describe("nothing an order uses can be deleted (S5)", () => {
  it("keeps a product that an order line points at", async () => {
    const { ryzen } = await setup()
    const { id } = await db.order.create({ data: orderData() })
    await item(id, ryzen)

    await expect(db.product.delete({ where: { id: ryzen } })).rejects.toThrow()
  })

  it("keeps a product that a stock movement points at", async () => {
    const { ryzen } = await setup()
    await db.stockMovement.create({
      data: { productId: ryzen, change: -1, reason: "ORDER_RESERVED" },
    })

    await expect(db.product.delete({ where: { id: ryzen } })).rejects.toThrow()
  })

  it("keeps a build that an order line points at", async () => {
    const { ryzen, buildId } = await setup()
    const { id } = await db.order.create({ data: orderData() })
    await item(id, ryzen, { buildId, slot: "cpu" })

    await expect(db.build.delete({ where: { id: buildId } })).rejects.toThrow()
  })

  it("keeps an order that has lines or movements", async () => {
    const { ryzen } = await setup()
    const { id } = await db.order.create({ data: orderData() })
    await item(id, ryzen)
    await expect(db.order.delete({ where: { id } })).rejects.toThrow()
  })
})

describe("resetCatalog (S6)", () => {
  it("empties orders, their lines and movements, and the cart tables", async () => {
    const { ryzen } = await setup()
    const { id } = await db.order.create({ data: orderData() })
    await item(id, ryzen)
    await db.stockMovement.create({
      data: {
        productId: ryzen,
        change: -1,
        reason: "ORDER_RESERVED",
        orderId: id,
      },
    })
    await db.cart.create({ data: { id: newCartId() } })

    await resetCatalog()

    expect(await db.order.count()).toBe(0)
    expect(await db.orderItem.count()).toBe(0)
    expect(await db.stockMovement.count()).toBe(0)
    expect(await db.cart.count()).toBe(0)
  })
})

// The search vector is rebuilt only when a column it reads is in the SET list
// (D11). The old trigger rebuilt it on every update, so a sentinel planted
// with triggers off survives a stock-only update only now.
describe("the narrowed search trigger (T1–T4)", () => {
  const SENTINEL = "'sentinel':1"

  const vectorOf = async (id: string) => {
    const rows = await db.$queryRaw<{ v: string }[]>`
      SELECT "searchVector"::text AS v FROM "Product" WHERE "id" = ${id}`
    return rows[0].v
  }
  // Written with triggers off for this transaction, since the trigger fires
  // on a write to searchVector itself (ADR 0005) and would replace it
  const plant = (id: string) =>
    db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`
      await tx.$executeRaw`
        UPDATE "Product" SET "searchVector" = ${SENTINEL}::tsvector WHERE "id" = ${id}`
    })

  it("leaves searchVector alone on a stock-only update (T1)", async () => {
    const { ryzen } = await setup()
    await plant(ryzen)

    await db.product.update({ where: { id: ryzen }, data: { stock: 7 } })
    await db.$executeRaw`UPDATE "Product" SET "stock" = "stock" - 1 WHERE "id" = ${ryzen}`
    await db.product.update({
      where: { id: ryzen },
      data: { price: 1_200_000, salePrice: 1_000_000, lowStockAt: 3 },
    })

    expect(await vectorOf(ryzen)).toBe(SENTINEL)
  })

  it.each([
    ["name", { name: "Renamed CPU" }],
    ["sku", { sku: "NEW-SKU-1" }],
    ["specs", { specs: { socket: "AM5" } }],
  ])("recomputes it when %s is updated (T2)", async (_field, data) => {
    const { ryzen } = await setup()
    await plant(ryzen)

    await db.product.update({ where: { id: ryzen }, data })

    expect(await vectorOf(ryzen)).not.toBe(SENTINEL)
  })

  it("recomputes it when the brand or category is set (T2)", async () => {
    const { ryzen } = await setup()
    const other = await db.brand.create({
      data: { name: "Other", slug: "other" },
    })
    await plant(ryzen)

    await db.product.update({
      where: { id: ryzen },
      data: { brandId: other.id },
    })

    expect(await vectorOf(ryzen)).not.toBe(SENTINEL)
    expect(await vectorOf(ryzen)).toContain("other")
  })

  it("still sets it on insert (T2)", async () => {
    const { ryzen } = await setup()
    const row = await db.product.findUniqueOrThrow({ where: { id: ryzen } })

    expect(await vectorOf(ryzen)).not.toBe("")
    expect(row.name).toBeTruthy()
  })

  it("refreshes products when a brand or category is renamed (T3)", async () => {
    const { ryzen } = await setup()
    const { brandId } = await db.product.findUniqueOrThrow({
      where: { id: ryzen },
      select: { brandId: true },
    })
    await plant(ryzen)

    await db.brand.update({
      where: { id: brandId },
      data: { name: "Zebrabrand" },
    })

    expect(await vectorOf(ryzen)).toContain("zebrabrand")
  })

  it("keeps effectivePrice right on a stock-only update and a sale price (T4)", async () => {
    const { ryzen } = await setup()

    await db.product.update({ where: { id: ryzen }, data: { stock: 4 } })
    const before = await db.product.findUniqueOrThrow({ where: { id: ryzen } })
    expect(before.effectivePrice).toBe(before.price)

    await db.product.update({
      where: { id: ryzen },
      data: { salePrice: 90_000 },
    })
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: ryzen } }))
        .effectivePrice
    ).toBe(90_000)
  })
})
