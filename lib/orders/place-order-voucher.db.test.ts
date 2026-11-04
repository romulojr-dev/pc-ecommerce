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

// docs/specs/037-vouchers-at-checkout: P1–P16 against the test database. The
// products weigh 100 g; the Ryzen 5 7600 costs ₱11,495.00 and the LANCOOL 216
// ₱5,795.00.

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidateTag: vi.fn(),
}))

beforeEach(async () => {
  await resetCatalog()
  await writeSeed(db, [], {
    reset: false,
    shipping: shippingSeed,
    vouchers: voucherSeed,
  })
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
const delivery = (voucherCode?: string) => ({
  method: "delivery",
  contact,
  address: QC,
  ...(voucherCode !== undefined && { voucherCode }),
})
const pickup = (voucherCode?: string) => ({
  method: "pickup",
  contact,
  ...(voucherCode !== undefined && { voucherCode }),
})

async function setup(stock = 40) {
  const ids = await insertParts([seed.ryzen5_7600, seed.lancool216], {
    [seed.ryzen5_7600.id]: { price: 1_149_500, stock },
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
async function prepare(cartId: string, details: object, now?: Date) {
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

const voucher = (overrides: Record<string, unknown> = {}) =>
  db.voucher.create({
    data: {
      code: "TEST",
      type: "PERCENT",
      value: 10,
      startsAt: new Date("2026-01-01T00:00:00+08:00"),
      ...overrides,
    } as Parameters<typeof db.voucher.create>[0]["data"],
  })

const usedOf = async (code: string) =>
  (await db.voucher.findUniqueOrThrow({ where: { code } })).usedCount

// Everything a placement touches, to show a refusal wrote nothing
const everything = async () => ({
  orders: await db.order.count(),
  items: await db.orderItem.count(),
  movements: await db.stockMovement.count(),
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

// usedCount is the number of orders holding the code that are not cancelled
async function usesMatchOrders(code: string) {
  const live = await db.order.count({
    where: { voucherCode: code, status: { not: "CANCELLED" } },
  })
  return { used: await usedOf(code), live }
}

describe("an order with a voucher", () => {
  it("P1: stores the code, the discount and the total, and counts the use", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 2)
    const request = await prepare(cart, delivery("welcome10"))
    const row = await db.voucher.findUniqueOrThrow({
      where: { code: "WELCOME10" },
    })

    const result = await placeOrder(cart, request)

    expect(result.ok).toBe(true)
    const order = await db.order.findFirstOrThrow()
    expect(order).toMatchObject({
      subtotal: 2_299_000,
      shippingFee: 12_000,
      discount: 229_900,
      total: 2_081_100,
      voucherId: row.id,
      voucherCode: "WELCOME10",
    })
    expect(await usedOf("WELCOME10")).toBe(1)
    expect(await usedOf("SAVE500")).toBe(0)
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: p.ryzen } })).stock
    ).toBe(38)
    expect(await db.stockMovement.count()).toBe(1)
    expect(await db.cartItem.count({ where: { cartId: cart } })).toBe(0)
    // The lines keep their own prices: one number for the discount
    expect(
      (await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } }))
        .priceSnapshot
    ).toBe(1_149_500)
  })

  it("P2: the same request again returns the order and counts nothing more", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 2)
    const request = await prepare(cart, delivery("WELCOME10"))

    const first = await placeOrder(cart, request)
    const second = await placeOrder(cart, request)

    expect(first).toEqual(second)
    expect(await db.order.count()).toBe(1)
    expect(await usedOf("WELCOME10")).toBe(1)
  })

  it("P11: SAVE500 on a pickup order of ₱11,590.00", async () => {
    const p = await setup()
    const cart = await cartOf(p.lancool, 2)
    const request = await prepare(cart, pickup("SAVE500"))

    expect((await placeOrder(cart, request)).ok).toBe(true)

    expect(await db.order.findFirstOrThrow()).toMatchObject({
      subtotal: 1_159_000,
      shippingFee: 0,
      discount: 50_000,
      total: 1_109_000,
      voucherCode: "SAVE500",
    })
  })

  it("an order with no code leaves every voucher alone", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 1)
    const request = await prepare(cart, delivery())

    expect((await placeOrder(cart, request)).ok).toBe(true)

    expect(await db.order.findFirstOrThrow()).toMatchObject({
      discount: 0,
      voucherId: null,
      voucherCode: null,
    })
    expect(await db.voucher.count({ where: { usedCount: { not: 0 } } })).toBe(0)
  })
})

describe("a refusal writes nothing", () => {
  async function refused(
    request: Request,
    cart: string,
    change?: () => Promise<unknown>
  ) {
    const before = await everything()
    await change?.()
    const changed = await everything()
    const result = await placeOrder(cart, request)
    expect(result).toEqual({ ok: false, reason: "changed" })
    expect(await everything()).toEqual(changed)
    return { before, after: await everything() }
  }

  it("P5: a code that ended after the review", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 2)
    const request = await prepare(cart, delivery("WELCOME10"))

    await refused(request, cart, () =>
      db.voucher.update({
        where: { code: "WELCOME10" },
        data: { endsAt: new Date("2026-02-01T00:00:00Z") },
      })
    )

    expect(await usedOf("WELCOME10")).toBe(0)
  })

  it("P6: a code used up after the review", async () => {
    const p = await setup()
    await voucher({ usageLimit: 5 })
    const cart = await cartOf(p.ryzen, 1)
    const request = await prepare(cart, delivery("TEST"))

    await refused(request, cart, () =>
      db.voucher.update({ where: { code: "TEST" }, data: { usedCount: 5 } })
    )

    expect(await usedOf("TEST")).toBe(5)
  })

  it("P7: a code added to a review that had none", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 2)
    const request = await prepare(cart, delivery())

    await refused({ ...request, details: delivery("WELCOME10") }, cart)

    expect(await usedOf("WELCOME10")).toBe(0)
  })

  it("P8: a review with a code, placed without it", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 2)
    const request = await prepare(cart, delivery("WELCOME10"))

    await refused({ ...request, details: delivery() }, cart)

    expect(await usedOf("WELCOME10")).toBe(0)
  })

  it("P9: a code the review refused, sent anyway", async () => {
    const p = await setup()
    const cart = await cartOf(p.lancool, 1)
    const request = await prepare(cart, pickup("NOPE"))

    await refused(request, cart)
  })

  it("P12: the price drops under the minimum spend after the review", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 2)
    const request = await prepare(cart, delivery("SAVE500"))

    await refused(request, cart, () =>
      db.product.update({ where: { id: p.ryzen }, data: { price: 450_000 } })
    )

    expect(await usedOf("SAVE500")).toBe(0)
  })

  it("P14: a code that would leave ₱19.99, sent in a forged call", async () => {
    const p = await setup()
    await voucher({ code: "NEARLY", type: "FIXED", value: 577_501 })
    const cart = await cartOf(p.lancool, 1)
    const request = await prepare(cart, pickup())

    await refused({ ...request, details: pickup("NEARLY") }, cart)

    expect(await usedOf("NEARLY")).toBe(0)
  })

  it("P16: terms that changed between the read and the count", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 2)
    const request = await prepare(cart, delivery("WELCOME10"))
    const before = await everything()

    const result = await placeOrder(cart, request, {
      afterStep: async (step: PlaceStep) => {
        if (step === "checks") {
          await db.voucher.update({
            where: { code: "WELCOME10" },
            data: { value: 20 },
          })
        }
      },
    })

    expect(result).toEqual({ ok: false, reason: "changed" })
    expect(await db.order.count()).toBe(0)
    expect(await usedOf("WELCOME10")).toBe(0)
    const after = await everything()
    expect(after.products).toEqual(before.products)
    expect(after.lines).toEqual(before.lines)
  })

  it("P10: a failure after the count rolls the count back", async () => {
    const p = await setup()
    const cart = await cartOf(p.ryzen, 2)
    const request = await prepare(cart, delivery("WELCOME10"))
    const before = await everything()
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      const result = await placeOrder(cart, request, {
        afterStep: (step: PlaceStep) => {
          if (step === "order") throw new Error("boom")
        },
      })
      expect(result).toEqual({ ok: false, reason: "error" })
    } finally {
      spy.mockRestore()
    }

    expect(await everything()).toEqual(before)
    expect(await usedOf("WELCOME10")).toBe(0)
  })
})

describe("one now (P15)", () => {
  const ENDS = new Date("2026-06-01T00:00:00Z")

  it("places when its now is a millisecond before the end, whatever the database clock says", async () => {
    const p = await setup()
    await voucher({ endsAt: ENDS })
    const cart = await cartOf(p.ryzen, 1)
    const now = new Date(ENDS.getTime() - 1)
    const request = await prepare(cart, delivery("TEST"), now)

    const result = await placeOrder(cart, request, { now })

    // The real clock is long past ENDS: only the caller's now can allow this
    expect(result.ok).toBe(true)
    expect(await usedOf("TEST")).toBe(1)
  })

  it("refuses when its now is the end itself, though the review thought it valid", async () => {
    const p = await setup()
    await voucher({ endsAt: ENDS })
    const cart = await cartOf(p.ryzen, 1)
    const request = await prepare(
      cart,
      delivery("TEST"),
      new Date(ENDS.getTime() - 1)
    )

    const result = await placeOrder(cart, request, { now: ENDS })

    expect(result).toEqual({ ok: false, reason: "changed" })
    expect(await usedOf("TEST")).toBe(0)
    expect(await db.order.count()).toBe(0)
  })

  it("agrees with its own validation at the start of the voucher", async () => {
    const p = await setup()
    const STARTS = new Date("2026-03-01T00:00:00Z")
    await voucher({ startsAt: STARTS })
    const cart = await cartOf(p.ryzen, 1)
    const request = await prepare(cart, delivery("TEST"), STARTS)

    const result = await placeOrder(cart, request, { now: STARTS })

    expect(result.ok).toBe(true)
  })
})

describe("racing for the last use", () => {
  it("P3: two carts, one use: exactly one wins and the loser writes nothing", async () => {
    const p = await setup()
    await voucher({ usageLimit: 1 })
    const a = await cartOf(p.lancool, 2)
    const b = await cartOf(p.lancool, 2)
    const ra = await prepare(a, pickup("TEST"))
    const rb = await prepare(b, pickup("TEST"))

    const [x, y] = await Promise.all([placeOrder(a, ra), placeOrder(b, rb)])

    expect([x.ok, y.ok].sort()).toEqual([false, true])
    const loser = x.ok ? { cart: b, result: y } : { cart: a, result: x }
    expect(loser.result).toEqual({ ok: false, reason: "changed" })
    expect(await usedOf("TEST")).toBe(1)
    expect(await db.order.count()).toBe(1)
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: p.lancool } })).stock
    ).toBe(38)
    expect(await db.cartItem.count({ where: { cartId: loser.cart } })).toBe(1)
    // Its next review says why
    const next = await reviewCheckout(loser.cart, pickup("TEST"))
    expect(next.ok && next.review.voucher).toMatchObject({
      kind: "refused",
      refusal: { reason: "used-up" },
    })
  })

  it("P4: thirteen carts, five uses: five orders, never over the limit", async () => {
    const p = await setup(60)
    await voucher({ usageLimit: 5 })
    const requests: { cart: string; request: Request }[] = []
    for (let i = 0; i < 13; i++) {
      const cart = await cartOf(p.lancool, 2)
      requests.push({ cart, request: await prepare(cart, pickup("TEST")) })
    }

    const results = await Promise.all(
      requests.map(({ cart, request }) => placeOrder(cart, request))
    )

    expect(results.filter((r) => r.ok)).toHaveLength(5)
    expect(results.filter((r) => !r.ok && r.reason === "changed")).toHaveLength(
      8
    )
    expect(await usedOf("TEST")).toBe(5)
    expect(await db.order.count()).toBe(5)
    expect(await usesMatchOrders("TEST")).toEqual({ used: 5, live: 5 })
  })

  it("P13: a release giving a use back while two carts race for it, 20 times", async () => {
    const p = await setup(1_000)
    const day = 24 * 3_600_000
    for (let i = 0; i < 20; i++) {
      const code = `RACE${i}`
      await voucher({ code, usageLimit: 2 })

      // X holds one use and is already past its deadline
      const longAgo = new Date(Date.now() - 2 * day)
      const x = await cartOf(p.ryzen, 1)
      const rx = await prepare(x, pickup(code), longAgo)
      expect((await placeOrder(x, rx, { now: longAgo })).ok).toBe(true)

      // The two racers review while a use is still free; Z then takes it
      const a = await cartOf(p.ryzen, 1)
      const b = await cartOf(p.ryzen, 1)
      const ra = await prepare(a, pickup(code))
      const rb = await prepare(b, pickup(code))
      const z = await cartOf(p.lancool, 1)
      const rz = await prepare(z, pickup(code))
      expect((await placeOrder(z, rz)).ok).toBe(true)
      expect(await usedOf(code)).toBe(2)

      // Placing releases X, which gives the use back: one racer gets it
      const [ya, yb] = await Promise.all([placeOrder(a, ra), placeOrder(b, rb)])

      expect([ya.ok, yb.ok].sort()).toEqual([false, true])
      const { used, live } = await usesMatchOrders(code)
      expect(used).toBe(2)
      expect(live).toBe(2)
      expect(
        await db.order.count({
          where: { voucherCode: code, status: "CANCELLED" },
        })
      ).toBe(1)
    }
  })
})

describe("logs", () => {
  it("never carry the code, the discount or the count", async () => {
    const p = await setup()
    const methods = ["log", "info", "warn", "error", "debug"] as const
    const spies = methods.map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {})
    )
    try {
      const a = await cartOf(p.ryzen, 2)
      await placeOrder(a, await prepare(a, delivery("WELCOME10")))
      const b = await cartOf(p.ryzen, 2)
      const rb = await prepare(b, delivery("WELCOME10"))
      await db.voucher.update({
        where: { code: "WELCOME10" },
        data: { endsAt: new Date("2026-02-01T00:00:00Z") },
      })
      expect((await placeOrder(b, rb)).ok).toBe(false)
      const c = await cartOf(p.ryzen, 1)
      const rc = await prepare(c, delivery())
      await placeOrder(c, rc, {
        afterStep: (step: PlaceStep) => {
          if (step === "voucher") throw new Error("WELCOME10 229900")
        },
      })

      const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls))
      expect(logged).not.toContain("WELCOME10")
      expect(logged).not.toContain("229900")
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
  })
})
