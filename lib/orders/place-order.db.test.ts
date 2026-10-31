import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { warningKey } from "@/lib/build-state/warnings"
import type { BuildItem } from "@/lib/builder"
import { addBuildToCart } from "@/lib/cart/build"
import { newCartId } from "@/lib/cart/id"
import { reviewCheckout } from "@/lib/checkout/review-checkout"
import { shippingSeed } from "@/prisma/seed/data/shipping"
import { writeSeed } from "@/prisma/seed/write"
import {
  insertParts,
  itemsWithIds,
  partsOfBuild,
} from "@/test-support/build-fixtures"
import { db, FIXTURE_TODAY, resetCatalog } from "@/test-support/db"
import { buildA, buildB, seed } from "@/test-support/seed-parts"

import { hashCartId, hashToken } from "./secrets"
import { type PlaceStep, placeOrder } from "./place-order"

// docs/specs/030-place-an-order: P1–P37, against the test database. Every
// product weighs 100 g and costs ₱1,000.00 unless a test says otherwise (the
// Ryzen 5 7600 ₱11,495.00), so totals are worked out from the lines.

const revalidateTag = vi.hoisted(() => vi.fn())
// Only revalidateTag is replaced: lib/home.ts (where PRODUCTS_TAG lives) wraps
// its loaders in unstable_cache when it is imported
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidateTag,
}))

beforeEach(async () => {
  revalidateTag.mockReset()
  await resetCatalog()
  await writeSeed(db, [], { reset: false, shipping: shippingSeed })
})
afterAll(() => db.$disconnect())

const contact = {
  email: "ana@example.com",
  name: "Ana Santos",
  mobile: "0917 123 4567",
}
const QC = {
  regionCode: "1300000000",
  provinceCode: "1300000000",
  cityCode: "1381300000",
  barangayCode: "1381300001",
  street: "12 Mabini St",
  zip: "1100",
}
const DAVAO = {
  regionCode: "1100000000",
  provinceCode: "1102400000",
  cityCode: "1130700000",
  barangayCode: "1130700001",
  street: "1 Roxas Ave",
  zip: "8000",
}
const delivery = (address: object = QC) => ({
  method: "delivery",
  contact,
  address,
})
const pickup = { method: "pickup", contact }

const RYZEN_PRICE = 1_149_500

async function setup(
  overrides: NonNullable<Parameters<typeof insertParts>[1]> = {}
) {
  const parts = new Map(
    [
      ...partsOfBuild(buildA()),
      ...partsOfBuild(buildB()),
      seed.proB760mDdr4,
    ].map((part) => [part.id, part])
  )
  const ids = await insertParts([...parts.values()], {
    [seed.ryzen5_7600.id]: { price: RYZEN_PRICE, stock: 12 },
    ...overrides,
  })
  return {
    id: (part: { id: string }) => ids.get(part.id)!,
    items: (build: Parameters<typeof itemsWithIds>[0]) =>
      itemsWithIds(build, ids),
  }
}

const newCart = async () => {
  const id = newCartId()
  await db.cart.create({ data: { id } })
  return id
}

const single = (cartId: string, productId: string, quantity: number) =>
  db.cartItem.create({ data: { cartId, productId, quantity } })

async function addBuild(items: BuildItem[], cartId: string) {
  const options = { cartId, today: FIXTURE_TODAY }
  const first = await addBuildToCart(
    { items, acknowledgedWarnings: [] },
    options
  )
  if (!first.result.ok && first.result.reason === "confirm") {
    await addBuildToCart(
      { items, acknowledgedWarnings: first.result.warnings.map(warningKey) },
      options
    )
  }
}

// A fresh review of the cart, as the browser would send it back
async function prepare(cartId: string, details: object = delivery()) {
  const result = await reviewCheckout(cartId, details)
  if (!result.ok) throw new Error(`review failed: ${result.reason}`)
  return {
    details,
    digest: result.digest,
    idempotencyKey: result.idempotencyKey,
    accessToken: result.accessToken,
  }
}

type Request = Awaited<ReturnType<typeof prepare>>

async function placed(cartId: string, request: Request) {
  const result = await placeOrder(cartId, request)
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
  return result
}

const stockOf = async (productId: string) =>
  (await db.product.findUniqueOrThrow({ where: { id: productId } })).stock

// Everything an order touches, to show a refusal wrote nothing
const everything = async () => ({
  orders: await db.order.count(),
  items: await db.orderItem.count(),
  movements: await db.stockMovement.count(),
  lines: await db.cartItem.findMany({ orderBy: { id: "asc" } }),
  products: await db.product.findMany({
    orderBy: { id: "asc" },
    select: { id: true, stock: true, effectivePrice: true },
  }),
  builds: await db.build.count(),
})

describe("a placed order", () => {
  it("P1: Ryzen 5 7600 × 2 to Quezon City", async () => {
    const { id } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 2)
    const request = await prepare(cart)
    const now = new Date("2026-10-31T07:42:00Z")

    const result = await placeOrder(cart, request, { now })

    expect(result).toMatchObject({ ok: true, accessToken: request.accessToken })
    if (!result.ok) return
    expect(result.orderNumber).toMatch(/^PCS-[0-9A-HJKMNP-TV-Z]{8}$/)

    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
      include: { items: true, stockMovements: true },
    })
    expect(order).toMatchObject({
      status: "PENDING_PAYMENT",
      fulfillment: "DELIVERY",
      zone: "METRO_MANILA",
      weightGrams: 200,
      subtotal: 2_299_000,
      shippingFee: 12_000,
      discount: 0,
      total: 2_311_000,
      guestEmail: "ana@example.com",
      contactName: "Ana Santos",
      contactMobile: "+639171234567",
      regionName: "National Capital Region (NCR)",
      provinceCode: null,
      provinceName: "Metro Manila",
      provinceIsGeographic: false,
      cityName: "Quezon City",
      barangayName: "Alicia",
      street: "12 Mabini St",
      zip: "1100",
      psgcVersion: "2026Q3",
      accessTokenHash: hashToken(request.accessToken),
      idempotencyKey: request.idempotencyKey,
    })
    expect(order.expiresAt).toEqual(new Date("2026-11-01T07:42:00Z"))
    expect(order.items).toHaveLength(1)
    expect(order.items[0]).toMatchObject({
      productId: id(seed.ryzen5_7600),
      nameSnapshot: seed.ryzen5_7600.name,
      priceSnapshot: RYZEN_PRICE,
      quantity: 2,
      buildId: null,
      slot: null,
      position: 0,
    })
    expect(order.stockMovements).toHaveLength(1)
    expect(order.stockMovements[0]).toMatchObject({
      productId: id(seed.ryzen5_7600),
      change: -2,
      reason: "ORDER_RESERVED",
      actorId: null,
    })
    expect(await stockOf(id(seed.ryzen5_7600))).toBe(10)
    expect(await db.cartItem.count({ where: { cartId: cart } })).toBe(0)
    expect(await db.cart.count({ where: { id: cart } })).toBe(1)
  })

  it("P2: a Build A group for pickup, in slot order", async () => {
    const { id, items } = await setup()
    const cart = await newCart()
    await addBuild(items(buildA()), cart)
    const request = await prepare(cart, pickup)

    const { orderNumber } = await placed(cart, request)

    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber },
      include: { items: { orderBy: { position: "asc" } } },
    })
    expect(order).toMatchObject({
      fulfillment: "PICKUP",
      zone: null,
      regionCode: null,
      street: null,
      psgcVersion: null,
      weightGrams: 800,
      shippingFee: 0,
    })
    expect(order.total).toBe(order.subtotal)
    expect(order.items).toHaveLength(8)
    const build = order.items[0].buildId
    expect(build).not.toBeNull()
    expect(order.items.every((line) => line.buildId === build)).toBe(true)
    expect(order.items.map((line) => line.slot)).toEqual([
      "cpu",
      "motherboard",
      "memory",
      "storage",
      "gpu",
      "case",
      "psu",
      "cpu-cooler",
    ])
    expect(order.items.map((line) => line.position)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ])
    expect(
      order.items.reduce((sum, l) => sum + l.priceSnapshot * l.quantity, 0)
    ).toBe(order.subtotal)
    expect(await db.stockMovement.count()).toBe(8)
    expect(await stockOf(id(seed.rtx4060))).toBe(9)
  })

  it("P3: a group and a single of the same product take one movement of −2", async () => {
    const { id, items } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    await addBuild(items(buildA()), cart)
    const request = await prepare(cart)

    const { orderNumber } = await placed(cart, request)

    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber },
      include: { items: true },
    })
    expect(order.items).toHaveLength(9)
    expect(
      order.items.filter((line) => line.productId === id(seed.ryzen5_7600))
    ).toHaveLength(2)
    const movements = await db.stockMovement.findMany({
      where: { productId: id(seed.ryzen5_7600) },
    })
    expect(movements).toHaveLength(1)
    expect(movements[0].change).toBe(-2)
    expect(await stockOf(id(seed.ryzen5_7600))).toBe(10)
  })

  it("P19: warnings don't block and need no confirmation", async () => {
    const { items } = await setup()
    const cart = await newCart()
    await addBuild(items(buildB()), cart)
    const request = await prepare(cart)

    const { orderNumber } = await placed(cart, request)

    const order = await db.order.findUniqueOrThrow({ where: { orderNumber } })
    expect(order.status).toBe("PENDING_PAYMENT")
    expect(order.total).toBe(order.subtotal + order.shippingFee)
  })

  it("P28: the expiry follows the settings", async () => {
    const { id } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    await db.storeSettings.update({
      where: { id: 1 },
      data: { orderExpiryHours: 48 },
    })
    const now = new Date("2026-10-31T07:42:00Z")

    const { orderNumber } = (await placeOrder(cart, await prepare(cart), {
      now,
    })) as { orderNumber: string }

    const order = await db.order.findUniqueOrThrow({ where: { orderNumber } })
    expect(order.expiresAt).toEqual(new Date("2026-11-02T07:42:00Z"))
  })

  it("P37: only hashes are stored", async () => {
    const { id } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    const request = await prepare(cart)

    const { orderNumber } = await placed(cart, request)

    const order = await db.order.findUniqueOrThrow({ where: { orderNumber } })
    expect(order.cartIdHash).toBe(hashCartId(cart))
    expect(order.accessTokenHash).toBe(hashToken(request.accessToken))
    const stored = JSON.stringify(order)
    expect(stored).not.toContain(cart)
    expect(stored).not.toContain(request.accessToken)
  })

  it("P30, P31: the order keeps what it was placed with", async () => {
    const { id } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    const { orderNumber } = await placed(cart, await prepare(cart))

    await db.product.update({
      where: { id: id(seed.ryzen5_7600) },
      data: { name: "Renamed", price: 1, status: "DRAFT" },
    })

    const line = await db.orderItem.findFirstOrThrow({
      where: { order: { orderNumber } },
    })
    expect(line.nameSnapshot).toBe(seed.ryzen5_7600.name)
    expect(line.priceSnapshot).toBe(RYZEN_PRICE)
  })

  it("revalidates the home page's tag once, after the commit (P29)", async () => {
    const { id } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 1)

    await placed(cart, await prepare(cart))

    expect(revalidateTag).toHaveBeenCalledTimes(1)
    expect(revalidateTag).toHaveBeenCalledWith("products", "max")
  })

  it("P29: an order stands when revalidating throws", async () => {
    const { id } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    revalidateTag.mockImplementation(() => {
      throw new Error("no store")
    })
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      const result = await placeOrder(cart, await prepare(cart))
      expect(result.ok).toBe(true)
      expect(await db.order.count()).toBe(1)
    } finally {
      spy.mockRestore()
    }
  })
})

describe("double submit and the idempotency key", () => {
  it("P4: the same request twice gives the same link, one order", async () => {
    const { id } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    const request = await prepare(cart)

    const first = await placed(cart, request)
    const second = await placed(cart, request)

    expect(second).toEqual(first)
    expect(await db.order.count()).toBe(1)
    expect(await db.stockMovement.count()).toBe(1)
    expect(await stockOf(id(seed.ryzen5_7600))).toBe(11)
    expect(revalidateTag).toHaveBeenCalledTimes(1)
  })

  it("P5: the same request twice at once", async () => {
    const { id } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    const request = await prepare(cart)

    const [a, b] = await Promise.all([
      placeOrder(cart, request),
      placeOrder(cart, request),
    ])

    expect(a).toMatchObject({ ok: true })
    expect(b).toEqual(a)
    expect(await db.order.count()).toBe(1)
    expect(await stockOf(id(seed.ryzen5_7600))).toBe(11)
  })

  it("P6: the same key with a different token is a duplicate", async () => {
    const { id } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    const request = await prepare(cart)
    await placed(cart, request)
    const other = await prepare(await cartWith(id, 1))

    const result = await placeOrder(cart, {
      ...request,
      accessToken: other.accessToken,
    })

    expect(result).toEqual({ ok: false, reason: "duplicate" })
    expect(await db.order.count()).toBe(1)
  })

  // A second cart with a Ryzen in it
  async function cartWith(id: (part: { id: string }) => string, quantity = 1) {
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), quantity)
    return cart
  }

  it("P32: another cart's key and token get no order back", async () => {
    const { id } = await setup()
    const c1 = await cartWith(id)
    const c1Request = await prepare(c1)
    await placed(c1, c1Request)
    const c2 = await cartWith(id)
    const c2Request = await prepare(c2)
    const before = await everything()

    const result = await placeOrder(c2, {
      ...c2Request,
      idempotencyKey: c1Request.idempotencyKey,
      accessToken: c1Request.accessToken,
    })

    expect(result).toEqual({ ok: false, reason: "duplicate" })
    expect(JSON.stringify(result)).not.toContain("PCS-")
    expect(await everything()).toEqual(before)
  })

  it("P33: another cart's key with its own token is a duplicate too", async () => {
    const { id } = await setup()
    const c1 = await cartWith(id)
    const c1Request = await prepare(c1)
    await placed(c1, c1Request)
    const c2 = await cartWith(id)
    const c2Request = await prepare(c2)
    const before = await everything()

    const result = await placeOrder(c2, {
      ...c2Request,
      idempotencyKey: c1Request.idempotencyKey,
    })

    expect(result).toEqual({ ok: false, reason: "duplicate" })
    expect(await everything()).toEqual(before)
  })

  it("P27: two carts racing with one key give one order", async () => {
    const { id } = await setup()
    const c1 = await cartWith(id)
    const c2 = await cartWith(id)
    const r1 = await prepare(c1)
    const r2 = await prepare(c2)
    const shared = {
      idempotencyKey: r1.idempotencyKey,
      accessToken: r1.accessToken,
    }

    const results = await Promise.all([
      placeOrder(c1, { ...r1, ...shared }),
      placeOrder(c2, { ...r2, ...shared }),
    ])

    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, reason: "duplicate" },
    ])
    expect(await db.order.count()).toBe(1)
    expect(await db.stockMovement.count()).toBe(1)
    expect(await stockOf(id(seed.ryzen5_7600))).toBe(11)
  })
})

describe("concurrent stock", () => {
  it("P7: two carts both succeed when stock allows", async () => {
    const { id } = await setup()
    const carts = await Promise.all([newCart(), newCart()])
    for (const cart of carts) await single(cart, id(seed.ryzen5_7600), 1)
    const requests = await Promise.all(carts.map((cart) => prepare(cart)))

    const results = await Promise.all(
      carts.map((cart, i) => placeOrder(cart, requests[i]))
    )

    expect(results.every((r) => r.ok)).toBe(true)
    expect(await stockOf(id(seed.ryzen5_7600))).toBe(10)
    expect(await db.order.count()).toBe(2)
  })

  it("P8: the last unit goes to exactly one of two", async () => {
    const { id } = await setup({ [seed.lancool216.id]: { stock: 1 } })
    const carts = await Promise.all([newCart(), newCart()])
    for (const cart of carts) await single(cart, id(seed.lancool216), 1)
    const requests = await Promise.all(carts.map((cart) => prepare(cart)))

    const results = await Promise.all(
      carts.map((cart, i) => placeOrder(cart, requests[i]))
    )

    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, reason: "changed" },
    ])
    expect(await stockOf(id(seed.lancool216))).toBe(0)
    expect(await db.order.count()).toBe(1)
    expect(await db.stockMovement.count()).toBe(1)
    // The loser's cart is untouched: its line is still there
    const loser = carts[results.findIndex((r) => !r.ok)]
    expect(await db.cartItem.count({ where: { cartId: loser } })).toBe(1)
  })

  it("P9: 13 carts for 12 units never oversell", async () => {
    const { id } = await setup()
    const carts = await Promise.all(Array.from({ length: 13 }, newCart))
    for (const cart of carts) await single(cart, id(seed.ryzen5_7600), 1)
    const requests: Request[] = []
    for (const cart of carts) requests.push(await prepare(cart))

    const results = await Promise.all(
      carts.map((cart, i) => placeOrder(cart, requests[i]))
    )

    expect(results.filter((r) => r.ok)).toHaveLength(12)
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, reason: "changed" },
    ])
    expect(await stockOf(id(seed.ryzen5_7600))).toBe(0)
    expect(await db.order.count()).toBe(12)
  }, 60_000)

  it("P10: carts holding the same two products in opposite order don't deadlock", async () => {
    const { id } = await setup({
      [seed.lancool216.id]: { stock: 100 },
      [seed.ryzen5_7600.id]: { price: RYZEN_PRICE, stock: 100 },
    })
    for (let round = 0; round < 20; round++) {
      const a = await newCart()
      const b = await newCart()
      await single(a, id(seed.ryzen5_7600), 1)
      await single(a, id(seed.lancool216), 1)
      await single(b, id(seed.lancool216), 1)
      await single(b, id(seed.ryzen5_7600), 1)
      const [ra, rb] = [await prepare(a), await prepare(b)]

      const results = await Promise.all([placeOrder(a, ra), placeOrder(b, rb)])

      expect(results.map((r) => r.ok)).toEqual([true, true])
    }
  }, 120_000)
})

describe("a refusal writes nothing", () => {
  it("P11: stock fell after the review", async () => {
    const { id } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 3)
    const request = await prepare(cart)
    await db.product.update({
      where: { id: id(seed.ryzen5_7600) },
      data: { stock: 2 },
    })
    const before = await everything()

    expect(await placeOrder(cart, request)).toEqual({
      ok: false,
      reason: "changed",
    })

    expect(await everything()).toEqual(before)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it("P12: the price changed after the review", async () => {
    const { id } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 2)
    const request = await prepare(cart)
    await db.product.update({
      where: { id: id(seed.ryzen5_7600) },
      data: { salePrice: 1_099_500 },
    })
    const before = await everything()

    expect(await placeOrder(cart, request)).toEqual({
      ok: false,
      reason: "changed",
    })

    expect(await everything()).toEqual(before)
    // A fresh review has a different digest and the new price
    const fresh = await prepare(cart)
    expect(fresh.digest).not.toBe(request.digest)
  })

  it("P13: the shipping fee changed after the review", async () => {
    const { id } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    const request = await prepare(cart)
    await db.shippingRate.updateMany({
      where: { zone: "METRO_MANILA", maxWeightGrams: 1_000 },
      data: { fee: 15_000 },
    })
    const before = await everything()

    expect(await placeOrder(cart, request)).toEqual({
      ok: false,
      reason: "changed",
    })
    expect(await everything()).toEqual(before)
  })

  it("P14: a line was added in another tab", async () => {
    const { id } = await setup()
    const cart = await newCart()
    const line = await single(cart, id(seed.ryzen5_7600), 1)
    const request = await prepare(cart)
    await db.cartItem.update({ where: { id: line.id }, data: { quantity: 2 } })
    const before = await everything()

    expect(await placeOrder(cart, request)).toEqual({
      ok: false,
      reason: "changed",
    })
    expect(await everything()).toEqual(before)
  })

  it("P15: a group with errors", async () => {
    const { id } = await setup()
    const cart = await newCart()
    const parts = partsOfBuild(buildA()).map((part) =>
      part.category === "motherboard" ? seed.proB760mDdr4 : part
    )
    const build = await db.build.create({
      data: {
        shareSlug: "errbuild01",
        contentHash: "err-hash",
        items: {
          create: parts.map((part) => ({
            slot: part.category,
            productId: id(part),
            quantity: 1,
          })),
        },
      },
      select: { id: true },
    })
    for (const part of parts) {
      await db.cartItem.create({
        data: {
          cartId: cart,
          productId: id(part),
          quantity: 1,
          buildId: build.id,
        },
      })
    }
    const request = await prepare(cart)
    const before = await everything()

    expect(await placeOrder(cart, request)).toEqual({
      ok: false,
      reason: "changed",
    })
    expect(await everything()).toEqual(before)
  })

  it("P16: a part of a group was retired", async () => {
    const { id, items } = await setup()
    const cart = await newCart()
    await addBuild(items(buildA()), cart)
    const request = await prepare(cart)
    await db.product.update({
      where: { id: id(seed.rtx4060) },
      data: { status: "DRAFT" },
    })
    const before = await everything()

    expect(await placeOrder(cart, request)).toEqual({
      ok: false,
      reason: "changed",
    })
    expect(await everything()).toEqual(before)
  })

  it("P17: the zone lost its rates", async () => {
    const { id } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    const request = await prepare(cart, delivery(DAVAO))
    await db.shippingRate.deleteMany({ where: { zone: "MINDANAO" } })
    const before = await everything()

    expect(await placeOrder(cart, request)).toEqual({
      ok: false,
      reason: "changed",
    })
    expect(await everything()).toEqual(before)
  })

  it("P18: pickup was turned off", async () => {
    const { id } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    const request = await prepare(cart, pickup)
    await db.storeSettings.update({
      where: { id: 1 },
      data: { pickupEnabled: false },
    })
    const before = await everything()

    const result = await placeOrder(cart, request)

    expect(result).toMatchObject({
      ok: false,
      reason: "invalid",
      fields: {
        method: "Store pickup isn't available right now. Choose delivery.",
      },
    })
    expect(await everything()).toEqual(before)
  })

  it("P20: an empty cart, and no cart row", async () => {
    const { id } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    const request = await prepare(cart)
    await db.cartItem.deleteMany({ where: { cartId: cart } })

    expect(await placeOrder(cart, request)).toEqual({
      ok: false,
      reason: "empty",
    })
    expect(await placeOrder(newCartId(), request)).toEqual({
      ok: false,
      reason: "empty",
    })
    expect(await placeOrder(null, request)).toEqual({
      ok: false,
      reason: "empty",
    })
    expect(await db.order.count()).toBe(0)
  })

  it("P23: a digest from another cart's review", async () => {
    const { id } = await setup()
    const mine = await newCart()
    const other = await newCart()
    await single(mine, id(seed.ryzen5_7600), 1)
    await single(other, id(seed.ryzen5_7600), 3)
    const request = await prepare(mine)
    const foreign = await prepare(other)
    const before = await everything()

    expect(
      await placeOrder(mine, { ...request, digest: foreign.digest })
    ).toEqual({ ok: false, reason: "changed" })
    expect(await everything()).toEqual(before)
  })
})

describe("input", () => {
  it("P21: fields the request shouldn't carry are ignored", async () => {
    const { id } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    const request = await prepare(cart)

    const result = await placeOrder(cart, {
      ...request,
      subtotal: 1,
      total: 1,
      status: "PAID",
      fee: 0,
      userId: "u1",
      cartId: "another-cart",
    })

    expect(result.ok).toBe(true)
    const order = await db.order.findFirstOrThrow()
    expect(order.status).toBe("PENDING_PAYMENT")
    expect(order.total).toBe(RYZEN_PRICE + 12_000)
  })

  it("P22, P34: a bad shape is invalid with no lock and no write", async () => {
    const { id } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    const request = await prepare(cart)
    const before = await everything()

    for (const bad of [
      { digest: "x" },
      { digest: "z".repeat(64) },
      { idempotencyKey: request.idempotencyKey.slice(0, 21) },
      { idempotencyKey: request.accessToken },
      { accessToken: request.accessToken.slice(0, 42) },
      { accessToken: request.idempotencyKey },
      { accessToken: "A".repeat(42) + "B" },
    ]) {
      expect(await placeOrder(cart, { ...request, ...bad })).toMatchObject({
        ok: false,
        reason: "invalid",
      })
    }
    expect(await placeOrder(cart, null)).toMatchObject({ reason: "invalid" })
    expect(await everything()).toEqual(before)
  })

  it("keys a bad detail by its path, as the review does", async () => {
    const { id } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    const request = await prepare(cart)

    const result = await placeOrder(cart, {
      ...request,
      details: { ...pickup, contact: { ...contact, mobile: "123" } },
    })

    expect(result).toMatchObject({
      ok: false,
      reason: "invalid",
      fields: { "contact.mobile": "Enter a mobile number like 0917 123 4567." },
    })
  })
})

describe("failures roll everything back", () => {
  async function failAt(step: PlaceStep) {
    const { id, items } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    await addBuild(items(buildA()), cart)
    const request = await prepare(cart)
    const before = await everything()
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      const result = await placeOrder(cart, request, {
        afterStep: (name) => {
          // A message that carries the secrets, as a database error can
          if (name === step) {
            throw Object.assign(
              new Error(
                `Key (idempotencyKey)=(${request.idempotencyKey}) token ${request.accessToken} ${contact.email}`
              ),
              { code: "XX000" }
            )
          }
        },
      })
      expect(result).toEqual({ ok: false, reason: "error" })
      expect(await everything()).toEqual(before)
      expect(revalidateTag).not.toHaveBeenCalled()

      // P35: the log names the error and its code, nothing else
      const logged = JSON.stringify(spy.mock.calls)
      expect(logged).toContain("Place order failed: Error (XX000)")
      for (const secret of [
        request.idempotencyKey,
        request.accessToken,
        request.digest,
        cart,
        contact.email,
        contact.name,
        "12 Mabini",
      ]) {
        expect(logged).not.toContain(secret)
      }
    } finally {
      spy.mockRestore()
    }
  }

  it.each(["stock", "order", "items", "movements", "cart"] as const)(
    "P24, P35: a failure after the %s step leaves nothing behind",
    (step) => failAt(step)
  )

  it("P25: a taken order number is retried", async () => {
    const { id } = await setup()
    const first = await newCart()
    await single(first, id(seed.ryzen5_7600), 1)
    const taken = (await placed(first, await prepare(first))).orderNumber
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    const numbers = [taken, "PCS-0000FREE".replace("FREE", "ABCD")]

    const result = await placeOrder(cart, await prepare(cart), {
      newNumber: () => numbers.shift()!,
    })

    expect(result).toMatchObject({ ok: true, orderNumber: "PCS-0000ABCD" })
    expect(await db.order.count()).toBe(2)
  })

  it("P26: three taken numbers is an error with nothing written", async () => {
    const { id } = await setup()
    const first = await newCart()
    await single(first, id(seed.ryzen5_7600), 1)
    const taken = (await placed(first, await prepare(first))).orderNumber
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    const request = await prepare(cart)
    const before = await everything()
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      expect(
        await placeOrder(cart, request, { newNumber: () => taken })
      ).toEqual({ ok: false, reason: "error" })
    } finally {
      spy.mockRestore()
    }
    expect(await everything()).toEqual(before)
  })
})

describe("a refusal logs nothing", () => {
  it("is quiet on an ordinary refusal", async () => {
    const { id } = await setup()
    const cart = await newCart()
    await single(cart, id(seed.ryzen5_7600), 3)
    const request = await prepare(cart)
    await db.product.update({
      where: { id: id(seed.ryzen5_7600) },
      data: { stock: 1 },
    })
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      await placeOrder(cart, request)
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})
