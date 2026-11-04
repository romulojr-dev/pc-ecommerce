import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { newCartId } from "@/lib/cart/id"
import { reviewCheckout } from "@/lib/checkout/review-checkout"
import { shippingSeed } from "@/prisma/seed/data/shipping"
import { voucherSeed } from "@/prisma/seed/data/vouchers"
import { writeSeed } from "@/prisma/seed/write"
import { insertParts } from "@/test-support/build-fixtures"
import { db, resetCatalog } from "@/test-support/db"
import { seed } from "@/test-support/seed-parts"

import { type PlaceStep, placeOrder } from "./place-order"

// docs/specs/038-cash-on-delivery: P1, P3–P14 against the test database. The
// products weigh 100 g; the Ryzen 5 7600 costs ₱11,495.00 and the LANCOOL 216
// ₱5,795.00. P2 and P15 are the action's (app/(store)/checkout).

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidateTag: vi.fn(),
}))

const NOW = new Date("2026-11-04T02:00:00Z")

beforeEach(async () => {
  await resetCatalog()
  await writeSeed(db, [], {
    reset: false,
    shipping: shippingSeed,
    vouchers: voucherSeed,
  })
  vi.spyOn(console, "error").mockImplementation(() => {})
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
type Payment = "online" | "cod"
const delivery = (payment?: Payment, voucherCode?: string) => ({
  method: "delivery",
  contact,
  address: QC,
  ...(payment !== undefined && { payment }),
  ...(voucherCode !== undefined && { voucherCode }),
})
const pickup = (payment?: Payment) => ({
  method: "pickup",
  contact,
  ...(payment !== undefined && { payment }),
})

async function setup(stock = 40, prices: { ryzen?: number } = {}) {
  const ids = await insertParts([seed.ryzen5_7600, seed.lancool216], {
    [seed.ryzen5_7600.id]: { price: prices.ryzen ?? 1_149_500, stock },
    [seed.lancool216.id]: { price: 579_500, stock },
  })
  return {
    ryzen: ids.get(seed.ryzen5_7600.id)!,
    lancool: ids.get(seed.lancool216.id)!,
  }
}

async function cartOf(productId: string, quantity: number) {
  const id = newCartId()
  await db.cart.create({ data: { id } })
  await db.cartItem.create({ data: { cartId: id, productId, quantity } })
  return id
}

// A fresh review, as the browser would send it back
async function prepare(cartId: string, details: object, now = NOW) {
  const result = await reviewCheckout(cartId, details, now)
  if (!result.ok) throw new Error(`review failed: ${result.reason}`)
  return {
    details,
    digest: result.digest,
    idempotencyKey: result.idempotencyKey,
    accessToken: result.accessToken,
  }
}
type Request = Awaited<ReturnType<typeof prepare>>

const settings = (
  data: Parameters<typeof db.storeSettings.update>[0]["data"]
) => db.storeSettings.update({ where: { id: 1 }, data })

const stockOf = async (id: string) =>
  (await db.product.findUniqueOrThrow({ where: { id } })).stock

// Everything a placement touches, to show a refusal wrote nothing
const everything = async () => ({
  orders: await db.order.count(),
  items: await db.orderItem.count(),
  movements: await db.stockMovement.count(),
  emails: await db.emailOutbox.count(),
  payments: await db.payment.count(),
  lines: await db.cartItem.findMany({ orderBy: { id: "asc" } }),
  products: await db.product.findMany({
    orderBy: { id: "asc" },
    select: { id: true, stock: true },
  }),
  vouchers: await db.voucher.findMany({
    orderBy: { code: "asc" },
    select: { code: true, usedCount: true },
  }),
})

describe("a cash order", () => {
  it("P1: is Pending confirmation with a COD option, a confirmation email and no payment", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 2)
    const request = await prepare(cart, delivery("cod"))

    const result = await placeOrder(cart, request, { now: NOW })

    expect(result).toMatchObject({ ok: true, payment: "cod" })
    const order = await db.order.findFirstOrThrow()
    expect(order).toMatchObject({
      status: "PENDING_CONFIRMATION",
      paymentOption: "COD",
      fulfillment: "DELIVERY",
      subtotal: 2_299_000,
      shippingFee: 12_000,
      total: 2_311_000,
      paidAt: null,
      paymentMethod: null,
      confirmedAt: null,
      cancelledAt: null,
    })
    // 2026-11-05 10:00 in Manila: the placement's clock plus 24 hours
    expect(order.expiresAt).toEqual(new Date("2026-11-05T02:00:00Z"))
    expect(await stockOf(p.ryzen)).toBe(38)
    expect(await db.stockMovement.findMany()).toMatchObject([
      { change: -2, reason: "ORDER_RESERVED", orderId: order.id },
    ])
    expect(await db.cartItem.count({ where: { cartId: cart } })).toBe(0)
    // One confirmation email, and no "Order placed"
    expect(await db.emailOutbox.findMany()).toMatchObject([
      { orderId: order.id, type: "COD_CONFIRM", status: "PENDING" },
    ])
    expect(await db.payment.count()).toBe(0)
  })

  it("P3: the same request again returns the order and writes nothing more", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 2)
    const request = await prepare(cart, delivery("cod"))

    const first = await placeOrder(cart, request)
    const before = await everything()
    const second = await placeOrder(cart, request)

    expect(first).toMatchObject({ ok: true, payment: "cod" })
    expect(second).toEqual(first)
    expect(await everything()).toEqual(before)
    expect(await db.order.count()).toBe(1)
    expect(await db.emailOutbox.count()).toBe(1)
  })

  it("P4: the deadline is the placement's clock plus the confirmation time", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 2)
    await settings({ codConfirmHours: 2 })
    const request = await prepare(cart, delivery("cod"))

    await placeOrder(cart, request, { now: NOW })

    expect((await db.order.findFirstOrThrow()).expiresAt).toEqual(
      new Date("2026-11-04T04:00:00Z")
    )
  })

  it("P14: a pickup order is Pending confirmation too, with no address", async () => {
    const p = await setup()
    const cart = await cartOf(p.lancool, 1)
    const request = await prepare(cart, pickup("cod"))

    const result = await placeOrder(cart, request, { now: NOW })

    expect(result).toMatchObject({ ok: true, payment: "cod" })
    expect(await db.order.findFirstOrThrow()).toMatchObject({
      status: "PENDING_CONFIRMATION",
      paymentOption: "COD",
      fulfillment: "PICKUP",
      zone: null,
      shippingFee: 0,
      total: 579_500,
    })
  })

  it("P12: holds a voucher's use like any order", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 2)
    await settings({ codMaxTotal: 2_081_100 })
    const request = await prepare(cart, delivery("cod", "WELCOME10"))

    const result = await placeOrder(cart, request, { now: NOW })

    expect(result).toMatchObject({ ok: true, payment: "cod" })
    expect(await db.order.findFirstOrThrow()).toMatchObject({
      status: "PENDING_CONFIRMATION",
      discount: 229_900,
      total: 2_081_100,
      voucherCode: "WELCOME10",
    })
    expect(
      (await db.voucher.findUniqueOrThrow({ where: { code: "WELCOME10" } }))
        .usedCount
    ).toBe(1)
  })

  it("an online order is as it was: Pending payment, an Order placed email", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 2)
    const request = await prepare(cart, delivery())

    const result = await placeOrder(cart, request, { now: NOW })

    expect(result).toMatchObject({ ok: true, payment: "online" })
    const order = await db.order.findFirstOrThrow()
    expect(order).toMatchObject({
      status: "PENDING_PAYMENT",
      paymentOption: "ONLINE",
    })
    expect(order.expiresAt).toEqual(new Date("2026-11-05T02:00:00Z"))
    expect(await db.emailOutbox.findMany()).toMatchObject([
      { type: "ORDER_PLACED" },
    ])
  })
})

describe("a refusal writes nothing", () => {
  async function refused(
    request: Request,
    cart: string,
    change?: () => Promise<unknown>
  ) {
    await change?.()
    const before = await everything()
    const result = await placeOrder(cart, request, { now: NOW })
    expect(result).toEqual({ ok: false, reason: "changed" })
    expect(await everything()).toEqual(before)
    expect(before.orders).toBe(0)
  }

  it("P5: cash switched off after the review", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 2)
    const request = await prepare(cart, delivery("cod"))

    await refused(request, cart, () => settings({ codEnabled: false }))
  })

  it("P6: the limit lowered below the total after the review", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 2)
    const request = await prepare(cart, delivery("cod"))

    await refused(request, cart, () => settings({ codMaxTotal: 2_310_999 }))
  })

  it("P7: the zone removed after the review", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 2)
    const request = await prepare(cart, delivery("cod"))

    await refused(request, cart, () => settings({ codZones: ["LUZON"] }))
  })

  it("P8: a review that was online, placed as cash", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 2)
    const request = await prepare(cart, delivery("online"))

    await refused({ ...request, details: delivery("cod") }, cart)
  })

  it("P9: a review that was cash, placed as online", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 2)
    const request = await prepare(cart, delivery("cod"))

    await refused({ ...request, details: delivery("online") }, cart)
  })

  it("P10: cash that isn't offered, sent in a forged call with the online digest", async () => {
    // ₱75,010.00 with shipping: over the ₱50,000.00 limit
    const p = await setup(40, { ryzen: 7_456_000 })
    await db.product.update({
      where: { id: p.ryzen },
      data: { weightGrams: 15_860 },
    })
    const cart = await cartOf(p.ryzen, 1)
    const request = await prepare(cart, delivery("online"))

    await refused({ ...request, details: delivery("cod") }, cart)
  })

  it("a cash request that the review fell back from is refused too", async () => {
    const p = await setup(40, { ryzen: 7_456_000 })
    await db.product.update({
      where: { id: p.ryzen },
      data: { weightGrams: 15_860 },
    })
    const cart = await cartOf(p.ryzen, 1)
    // The review itself falls back to online: its digest is the online one
    const request = await prepare(cart, delivery("cod"))

    await refused(request, cart)
  })

  it("P5 variant: a pickup order after pay-on-pickup was switched off", async () => {
    const p = await setup()
    const cart = await cartOf(p.lancool, 1)
    const request = await prepare(cart, pickup("cod"))

    await refused(request, cart, () => settings({ codPickupEnabled: false }))
  })
})

describe("a failure rolls everything back", () => {
  it("P11: a failure after the email is enqueued leaves no order, email or stock change", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 2)
    const request = await prepare(cart, delivery("cod"))
    const before = await everything()

    const result = await placeOrder(cart, request, {
      now: NOW,
      afterStep: async (step: PlaceStep) => {
        if (step === "email") throw new Error("boom")
      },
    })

    expect(result).toEqual({ ok: false, reason: "error" })
    expect(await everything()).toEqual(before)
    // The failure is logged by name only: no token, key, address or link
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls)
    expect(logged).toContain("Place order failed")
    for (const secret of [
      request.accessToken,
      request.idempotencyKey,
      request.digest,
      "ana@example.com",
      "Mabini",
      cart,
    ]) {
      expect(logged).not.toContain(secret)
    }
  })
})

describe("racing for the last unit", () => {
  it("P13: one cash and one online order for one unit: exactly one wins, stock never negative", async () => {
    const p = await setup(1)
    const cashCart = await cartOf(p.ryzen, 1)
    const onlineCart = await cartOf(p.ryzen, 1)
    const cash = await prepare(cashCart, delivery("cod"))
    const online = await prepare(onlineCart, delivery("online"))

    const results = await Promise.all([
      placeOrder(cashCart, cash, { now: NOW }),
      placeOrder(onlineCart, online, { now: NOW }),
    ])

    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, reason: "changed" },
    ])
    expect(await stockOf(p.ryzen)).toBe(0)
    expect(await db.order.count()).toBe(1)
    expect(await db.stockMovement.count()).toBe(1)
  })

  it("two cash orders for two units both place and each holds one", async () => {
    const p = await setup(2)
    const a = await cartOf(p.ryzen, 1)
    const b = await cartOf(p.ryzen, 1)
    const ra = await prepare(a, delivery("cod"))
    const rb = await prepare(b, delivery("cod"))

    const results = await Promise.all([
      placeOrder(a, ra, { now: NOW }),
      placeOrder(b, rb, { now: NOW }),
    ])

    expect(results.every((r) => r.ok)).toBe(true)
    expect(await stockOf(p.ryzen)).toBe(0)
    expect(await db.emailOutbox.count({ where: { type: "COD_CONFIRM" } })).toBe(
      2
    )
  })
})
