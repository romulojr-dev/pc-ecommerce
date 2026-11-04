import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { newCartId } from "@/lib/cart/id"
import { db } from "@/lib/db"
import { shippingSeed } from "@/prisma/seed/data/shipping"
import { voucherSeed } from "@/prisma/seed/data/vouchers"
import { writeSeed } from "@/prisma/seed/write"
import { insertParts } from "@/test-support/build-fixtures"
import { resetCatalog } from "@/test-support/db"
import { seed } from "@/test-support/seed-parts"

import { reviewCheckout } from "./review-checkout"

// docs/specs/038-cash-on-delivery, V1–V15 through the real review: the cart,
// the shipping config (with its COD settings) and the clock. The pure cases are
// review-cod.test.ts's. Every product weighs 100 g unless a test sets it.

const NOW = new Date("2026-11-04T02:00:00Z")

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
const DAVAO = {
  regionCode: "1100000000",
  provinceCode: "1102400000",
  cityCode: "1130700000",
  barangayCode: "1130700001",
  street: "1 Roxas Ave",
  zip: "8000",
}

type Payment = "online" | "cod"
const delivery = (
  payment?: Payment,
  address: object = QC,
  voucherCode?: string
) => ({
  method: "delivery",
  contact,
  address,
  ...(payment !== undefined && { payment }),
  ...(voucherCode !== undefined && { voucherCode }),
})
const pickup = (payment?: Payment, voucherCode?: string) => ({
  method: "pickup",
  contact,
  ...(payment !== undefined && { payment }),
  ...(voucherCode !== undefined && { voucherCode }),
})

const RYZEN = 1_149_500
const LANCOOL = 579_500

async function setup(
  prices: { ryzen?: number; lancool?: number } = {},
  stock: { ryzen?: number } = {}
) {
  const ids = await insertParts([seed.ryzen5_7600, seed.lancool216], {
    [seed.ryzen5_7600.id]: {
      price: prices.ryzen ?? RYZEN,
      stock: stock.ryzen ?? 10,
    },
    [seed.lancool216.id]: { price: prices.lancool ?? LANCOOL },
  })
  return {
    ryzen: ids.get(seed.ryzen5_7600.id)!,
    lancool: ids.get(seed.lancool216.id)!,
  }
}

async function cartOf(...lines: [productId: string, quantity: number][]) {
  const { id } = await db.cart.create({
    data: { id: newCartId() },
    select: { id: true },
  })
  for (const [productId, quantity] of lines) {
    await db.cartItem.create({ data: { cartId: id, productId, quantity } })
  }
  return id
}

const settings = (
  data: Parameters<typeof db.storeSettings.update>[0]["data"]
) => db.storeSettings.update({ where: { id: 1 }, data })

async function ok(cartId: string | null, input: unknown) {
  const result = await reviewCheckout(cartId, input, NOW)
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
  return result
}

// "Build B": one ₱74,560.00 product that weighs what the build does
async function buildB() {
  const p = await setup({ ryzen: 7_456_000 })
  await db.product.update({
    where: { id: p.ryzen },
    data: { weightGrams: 15_860 },
  })
  return p
}

describe("V1–V2: choosing cash on a small order", () => {
  it("V1: with no choice the review is online and cash is offered", async () => {
    const p = await setup()
    const cart = await cartOf([p.ryzen, 2])

    const { review, holdHours } = await ok(cart, delivery())

    expect(review.payment).toEqual({
      requested: "online",
      chosen: "online",
      cod: { offered: true },
      limit: 5_000_000,
    })
    expect(review.total).toBe(2_311_000)
    expect(holdHours).toBe(24)
  })

  it("V2: cash chosen leaves the money alone, holds for the confirmation time, and changes the digest", async () => {
    const p = await setup()
    const cart = await cartOf([p.ryzen, 2])
    const online = await ok(cart, delivery("online"))
    await settings({ codConfirmHours: 6, orderExpiryHours: 24 })

    const cod = await ok(cart, delivery("cod"))

    expect(cod.review.payment.chosen).toBe("cod")
    expect(cod.review.total).toBe(2_311_000)
    expect(cod.holdHours).toBe(6)
    expect(cod.digest).not.toBe(online.digest)
    // the online review still holds for the payment time
    expect((await ok(cart, delivery("online"))).holdHours).toBe(24)
  })
})

describe("V3–V7: why cash isn't offered", () => {
  it("V3: a ₱75,010.00 order is over the limit, and cash falls back to online", async () => {
    const p = await buildB()
    const cart = await cartOf([p.ryzen, 1])

    const { review } = await ok(cart, delivery("cod"))

    expect(review.total).toBe(7_501_000)
    expect(review.payment).toMatchObject({
      requested: "cod",
      chosen: "online",
      cod: { offered: false, reason: "over-limit", overBy: 2_501_000 },
    })
    expect(review.canPlace).toBe(true)
  })

  it("V4: a voucher that still leaves the total over the limit doesn't help", async () => {
    const p = await buildB()
    const cart = await cartOf([p.ryzen, 1])

    const { review } = await ok(cart, delivery("cod", QC, "BUILD5000"))

    expect(review.total).toBe(7_001_000)
    expect(review.payment.cod).toMatchObject({ reason: "over-limit" })
  })

  it("V5/V6: the limit compares the total after the discount", async () => {
    const p = await setup()
    const cart = await cartOf([p.ryzen, 2])
    await settings({ codMaxTotal: 2_081_100 })

    const withCode = await ok(cart, delivery("cod", QC, "WELCOME10"))
    const without = await ok(cart, delivery("cod"))

    expect(withCode.review.total).toBe(2_081_100)
    expect(withCode.review.payment.chosen).toBe("cod")
    expect(without.review.total).toBe(2_311_000)
    expect(without.review.payment.cod).toMatchObject({ reason: "over-limit" })
  })

  it("the limit's boundary: equal is offered, one centavo less is not", async () => {
    const p = await setup()
    const cart = await cartOf([p.ryzen, 2])
    await settings({ codMaxTotal: 2_311_000 })
    expect((await ok(cart, delivery("cod"))).review.payment.chosen).toBe("cod")
    await settings({ codMaxTotal: 2_310_999 })
    expect((await ok(cart, delivery("cod"))).review.payment.cod).toEqual({
      offered: false,
      reason: "over-limit",
      overBy: 1,
    })
  })

  it("V7: a Davao address isn't in the demo zones", async () => {
    const p = await setup()
    const cart = await cartOf([p.ryzen, 2])

    const { review } = await ok(cart, delivery("cod", DAVAO))

    expect(review.total).toBe(2_320_000)
    expect(review.payment).toMatchObject({
      chosen: "online",
      cod: { offered: false, reason: "zone" },
    })
  })

  it("zones come from the settings: allow Mindanao and Davao is offered", async () => {
    const p = await setup()
    const cart = await cartOf([p.ryzen, 2])
    await settings({ codZones: ["MINDANAO"] })

    expect((await ok(cart, delivery("cod", DAVAO))).review.payment.chosen).toBe(
      "cod"
    )
    expect((await ok(cart, delivery("cod"))).review.payment.cod).toEqual({
      offered: false,
      reason: "zone",
    })
  })

  it("no limit (null) offers any total", async () => {
    const p = await buildB()
    const cart = await cartOf([p.ryzen, 1])
    await settings({ codMaxTotal: null })

    expect((await ok(cart, delivery("cod"))).review.payment.chosen).toBe("cod")
  })
})

describe("V8–V11: pay on pickup", () => {
  it("V8: a ₱5,795.00 pickup order is offered, with no shipping in the total", async () => {
    const p = await setup()
    const cart = await cartOf([p.lancool, 1])

    const { review } = await ok(cart, pickup("cod"))

    expect(review.payment.chosen).toBe("cod")
    expect(review.total).toBe(579_500)
  })

  it("V9: pay on pickup switched off", async () => {
    const p = await setup()
    const cart = await cartOf([p.lancool, 1])
    await settings({ codPickupEnabled: false })

    expect((await ok(cart, pickup("cod"))).review.payment.cod).toEqual({
      offered: false,
      reason: "pickup-off",
    })
  })

  it("V10: the master switch off refuses delivery and pickup", async () => {
    const p = await setup()
    const cart = await cartOf([p.lancool, 1])
    await settings({ codEnabled: false })

    expect((await ok(cart, pickup("cod"))).review.payment.cod).toEqual({
      offered: false,
      reason: "disabled",
    })
    expect((await ok(cart, delivery("cod"))).review.payment.cod).toEqual({
      offered: false,
      reason: "disabled",
    })
  })

  it("V11: a ₱69,060.00 pickup order is over the limit too", async () => {
    const p = await setup({ ryzen: 6_906_000 })
    const cart = await cartOf([p.ryzen, 1])

    const { review } = await ok(cart, pickup("cod"))

    expect(review.payment.cod).toMatchObject({ reason: "over-limit" })
    expect(review.payment.chosen).toBe("online")
  })
})

describe("V12–V15: independent of the rest of the review", () => {
  it("V12: a refused voucher doesn't touch the payment choice", async () => {
    const p = await setup()
    const cart = await cartOf([p.lancool, 1])

    const { review } = await ok(cart, pickup("cod", "SAVE500"))

    expect(review.voucher).toMatchObject({
      kind: "refused",
      refusal: { reason: "min-spend" },
    })
    expect(review.payment.chosen).toBe("cod")
  })

  it("V13: the ₱20.00 floor applies to a voucher on a cash order too", async () => {
    const p = await setup()
    const cart = await cartOf([p.lancool, 1])
    await db.voucher.create({
      data: {
        code: "ALMOST",
        type: "FIXED",
        value: 577_501,
        startsAt: new Date("2026-01-01T00:00:00+08:00"),
      },
    })

    const { review } = await ok(cart, pickup("cod", "ALMOST"))

    expect(review.voucher).toEqual({
      kind: "refused",
      refusal: { reason: "below-minimum" },
    })
    expect(review.total).toBe(579_500)
    expect(review.payment.chosen).toBe("cod")
  })

  it("V14: a cart with a line out of stock lists its problems; cash is still judged", async () => {
    const p = await setup({}, { ryzen: 0 })
    const cart = await cartOf([p.ryzen, 1], [p.lancool, 1])

    const { review } = await ok(cart, pickup("cod"))

    expect(review.problems.length).toBeGreaterThan(0)
    expect(review.canPlace).toBe(false)
    expect(review.payment.chosen).toBe("cod")
  })

  it("V15: a payment value that isn't a choice is invalid", async () => {
    const p = await setup()
    const cart = await cartOf([p.ryzen, 1])

    const result = await reviewCheckout(
      cart,
      { ...delivery(), payment: "cash" },
      NOW
    )

    expect(result).toMatchObject({
      ok: false,
      reason: "invalid",
      fields: { payment: "Choose how you'll pay." },
    })
  })

  it("a review reads the COD settings fresh every time", async () => {
    const p = await setup()
    const cart = await cartOf([p.ryzen, 2])
    expect((await ok(cart, delivery("cod"))).review.payment.chosen).toBe("cod")
    await settings({ codEnabled: false })
    expect((await ok(cart, delivery("cod"))).review.payment.chosen).toBe(
      "online"
    )
  })
})
