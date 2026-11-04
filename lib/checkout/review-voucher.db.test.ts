import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { newCartId } from "@/lib/cart/id"
import { db } from "@/lib/db"
import { shippingSeed } from "@/prisma/seed/data/shipping"
import { voucherSeed } from "@/prisma/seed/data/vouchers"
import { writeSeed } from "@/prisma/seed/write"
import { insertParts } from "@/test-support/build-fixtures"
import { resetCatalog } from "@/test-support/db"
import { seed } from "@/test-support/seed-parts"

import { checkoutInputSchema } from "./input"
import { computeReview, reviewCheckout } from "./review-checkout"

// docs/specs/037-vouchers-at-checkout, V1–V16 through the real review: the
// cart, the shipping config, the voucher row and the clock. The pure cases are
// review-voucher.test.ts's. Every product weighs 100 g unless a test sets it.

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
const delivery = (address: object = QC, voucherCode?: string) => ({
  method: "delivery",
  contact,
  address,
  ...(voucherCode !== undefined && { voucherCode }),
})
const pickup = (voucherCode?: string) => ({
  method: "pickup",
  contact,
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

async function ok(cartId: string | null, input: unknown) {
  const result = await reviewCheckout(cartId, input, NOW)
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
  return result
}

describe("V1–V2: a percent code", () => {
  it("V1: with no code the review is as it was", async () => {
    const p = await setup()
    const cart = await cartOf([p.ryzen, 2])

    const { review } = await ok(cart, delivery())

    expect(review.discount).toBe(0)
    expect(review.voucher).toEqual({ kind: "none" })
    expect(review.shipping).toEqual({ ok: true, fee: 12_000, basis: "rate" })
    expect(review.total).toBe(2_311_000)
  })

  it("V2: WELCOME10, typed in lower case, takes ₱2,299.00 off", async () => {
    const p = await setup()
    const cart = await cartOf([p.ryzen, 2])
    const plain = await ok(cart, delivery())

    const withCode = await ok(cart, delivery(QC, " welcome10 "))

    expect(withCode.review.voucher).toEqual({
      kind: "applied",
      code: "WELCOME10",
      discount: 229_900,
    })
    expect(withCode.review.discount).toBe(229_900)
    expect(withCode.review.shipping).toEqual({
      ok: true,
      fee: 12_000,
      basis: "rate",
    })
    expect(withCode.review.total).toBe(2_081_100)
    expect(withCode.digest).not.toBe(plain.digest)
  })

  it("never sends the voucher's row id to the browser", async () => {
    const p = await setup()
    const cart = await cartOf([p.ryzen, 2])
    const row = await db.voucher.findUniqueOrThrow({
      where: { code: "WELCOME10" },
    })

    const result = await ok(cart, delivery(QC, "WELCOME10"))

    expect(JSON.stringify(result)).not.toContain(row.id)
  })

  it("keeps the row id for the placement (computeReview)", async () => {
    const p = await setup()
    const cart = await cartOf([p.ryzen, 2])
    const row = await db.voucher.findUniqueOrThrow({
      where: { code: "WELCOME10" },
    })
    const parse = (input: unknown) => checkoutInputSchema.parse(input)

    const applied = await computeReview(
      db,
      cart,
      parse(delivery(QC, "WELCOME10")),
      NOW
    )
    const refused = await computeReview(
      db,
      cart,
      parse(delivery(QC, "NOPE")),
      NOW
    )
    const none = await computeReview(db, cart, parse(delivery()), NOW)

    expect(applied.ok && applied.voucher).toEqual({
      id: row.id,
      type: "PERCENT",
      value: 10,
      minSpend: 500_000,
    })
    expect(refused.ok && refused.voucher).toBeNull()
    expect(none.ok && none.voucher).toBeNull()
  })
})

describe("V3–V7: shipping does not depend on the voucher", () => {
  it("V3/V4: ₱80,555.00 ships free, with or without WELCOME10", async () => {
    const p = await setup({ ryzen: 8_055_500 })
    await db.product.update({
      where: { id: p.ryzen },
      data: { weightGrams: 16_310 },
    })
    const cart = await cartOf([p.ryzen, 1])

    const plain = await ok(cart, delivery())
    expect(plain.review.shipping).toMatchObject({
      fee: 0,
      basis: "free-shipping",
    })
    expect(plain.review.total).toBe(8_055_500)

    const { review } = await ok(cart, delivery(QC, "WELCOME10"))
    expect(review.discount).toBe(805_550)
    expect(review.shipping).toMatchObject({ fee: 0, basis: "free-shipping" })
    expect(review.total).toBe(7_249_950)
    expect(review.threshold).toBeNull()
  })

  it("V5/V5a: ₱75,050.00 to Davao, a ₱100.00 code lowers the total", async () => {
    const p = await setup({ ryzen: 7_505_000 })
    await db.product.update({
      where: { id: p.ryzen },
      data: { weightGrams: 21_000 },
    })
    await voucher({ type: "FIXED", value: 10_000 })
    const cart = await cartOf([p.ryzen, 1])

    const plain = await ok(cart, delivery(DAVAO))
    expect(plain.review.shipping).toMatchObject({
      fee: 0,
      basis: "free-shipping",
    })
    expect(plain.review.total).toBe(7_505_000)

    const { review } = await ok(cart, delivery(DAVAO, "TEST"))
    expect(review.shipping).toMatchObject({ fee: 0, basis: "free-shipping" })
    expect(review.total).toBe(7_495_000)
  })

  it("V6: below the threshold BUILD5000 leaves the ₱450.00 fee alone", async () => {
    const p = await setup({ ryzen: 7_456_000 })
    await db.product.update({
      where: { id: p.ryzen },
      data: { weightGrams: 15_000 },
    })
    const cart = await cartOf([p.ryzen, 1])

    const { review } = await ok(cart, delivery(QC, "BUILD5000"))

    expect(review.discount).toBe(500_000)
    expect(review.shipping).toEqual({ ok: true, fee: 45_000, basis: "rate" })
    expect(review.total).toBe(7_001_000)
  })

  it("V7: pickup is free and WELCOME10 comes off the merchandise", async () => {
    const p = await setup()
    const cart = await cartOf([p.ryzen, 2])

    const { review } = await ok(cart, pickup("WELCOME10"))

    expect(review.discount).toBe(229_900)
    expect(review.shipping).toMatchObject({ fee: 0, basis: "pickup" })
    expect(review.total).toBe(2_069_100)
  })
})

describe("V8–V12: the five refusals", () => {
  it("V8: SAVE500 on ₱5,795.00 asks for ₱4,205.00 more", async () => {
    const p = await setup()
    const cart = await cartOf([p.lancool, 1])

    const { review } = await ok(cart, pickup("SAVE500"))

    expect(review.voucher).toEqual({
      kind: "refused",
      refusal: { reason: "min-spend", shortBy: 420_500 },
    })
    expect(review.discount).toBe(0)
    expect(review.total).toBe(579_500)
    expect(review.canPlace).toBe(true)
  })

  it("V9: SAVE500 on ₱11,590.00 is applied; the minimum used the subtotal before the discount", async () => {
    const p = await setup()
    const cart = await cartOf([p.lancool, 2])

    const { review } = await ok(cart, pickup("SAVE500"))

    expect(review.discount).toBe(50_000)
    expect(review.total).toBe(1_109_000)
  })

  it("V10: BUILD5000 on a ₱74,560.00 order", async () => {
    const p = await setup({ ryzen: 7_456_000 })
    const cart = await cartOf([p.ryzen, 1])

    const { review } = await ok(cart, pickup("BUILD5000"))

    expect(review.discount).toBe(500_000)
    expect(review.total).toBe(6_956_000)
  })

  it("V11: a code nobody made is unknown", async () => {
    const p = await setup()
    const cart = await cartOf([p.lancool, 1])

    const { review } = await ok(cart, pickup("NOPE"))

    expect(review.voucher).toEqual({
      kind: "refused",
      refusal: { reason: "unknown" },
    })
  })

  it("V11: a refused code leaves the same digest as no code", async () => {
    const p = await setup()
    const cart = await cartOf([p.lancool, 1])

    const none = await ok(cart, pickup())
    const refused = await ok(cart, pickup("NOPE"))

    expect(refused.digest).toBe(none.digest)
  })

  it("V12: not started, ended, used up", async () => {
    const p = await setup()
    const cart = await cartOf([p.lancool, 1])
    await voucher({ code: "LATER", startsAt: new Date("2026-11-05T00:00:00Z") })
    await voucher({
      code: "OVER",
      startsAt: new Date("2026-01-01T00:00:00Z"),
      endsAt: new Date("2026-11-04T01:00:00Z"),
    })
    await voucher({ code: "GONE", usageLimit: 3, usedCount: 3 })

    const reasons = []
    for (const code of ["LATER", "OVER", "GONE"]) {
      const { review } = await ok(cart, pickup(code))
      reasons.push(
        review.voucher.kind === "refused" ? review.voucher.refusal.reason : null
      )
    }

    expect(reasons).toEqual(["not-started", "ended", "used-up"])
  })

  it("judges the dates against the clock it is given", async () => {
    const p = await setup()
    const cart = await cartOf([p.lancool, 1])
    await voucher({ code: "OVER", endsAt: new Date("2026-11-04T05:00:00Z") })

    const before = await reviewCheckout(cart, pickup("OVER"), NOW)
    const after = await reviewCheckout(
      cart,
      pickup("OVER"),
      new Date("2026-11-04T05:00:00Z")
    )

    expect(before.ok && before.review.voucher.kind).toBe("applied")
    expect(after.ok && after.review.voucher).toMatchObject({
      kind: "refused",
      refusal: { reason: "ended" },
    })
  })
})

describe("V13: the lowest total", () => {
  it("V13: refuses ₱0.00 and ₱19.99, accepts ₱20.00", async () => {
    const p = await setup()
    const cart = await cartOf([p.lancool, 1])
    await voucher({ code: "ALL", type: "PERCENT", value: 100 })
    await voucher({ code: "NEARLY", type: "FIXED", value: 577_501 })
    await voucher({ code: "EXACT", type: "FIXED", value: 577_500 })

    const out = {} as Record<string, string>
    for (const code of ["ALL", "NEARLY", "EXACT"]) {
      const { review } = await ok(cart, pickup(code))
      out[code] =
        review.voucher.kind === "refused"
          ? review.voucher.refusal.reason
          : `applied:${review.total}`
    }

    expect(out).toEqual({
      ALL: "below-minimum",
      NEARLY: "below-minimum",
      EXACT: "applied:2000",
    })
  })

  it("V13: the same 100 % code on a delivery order leaves the fee to pay", async () => {
    const p = await setup()
    const cart = await cartOf([p.lancool, 1])
    await voucher({ code: "ALL", type: "PERCENT", value: 100 })

    const { review } = await ok(cart, delivery(QC, "ALL"))

    expect(review.voucher.kind).toBe("applied")
    expect(review.total).toBe(12_000)
  })

  it("V13a: a full discount on an order that ships free is refused", async () => {
    const p = await setup({ ryzen: 8_055_500 })
    const cart = await cartOf([p.ryzen, 1])
    await voucher({ code: "FULL", type: "FIXED", value: 8_055_500 })
    await voucher({ code: "LEAVE20", type: "FIXED", value: 8_053_500 })

    const full = await ok(cart, delivery(QC, "FULL"))
    const leave = await ok(cart, delivery(QC, "LEAVE20"))

    expect(full.review.voucher).toMatchObject({
      kind: "refused",
      refusal: { reason: "below-minimum" },
    })
    expect(leave.review.voucher.kind).toBe("applied")
    expect(leave.review.total).toBe(2_000)
  })
})

describe("V14–V16: other carts and inputs", () => {
  it("V14: a retired line lists as a problem and the voucher discounts only what is still sold", async () => {
    const p = await setup()
    await db.product.update({
      where: { id: p.ryzen },
      data: { status: "DRAFT" },
    })
    const cart = await cartOf([p.lancool, 1], [p.ryzen, 1])

    const { review } = await ok(cart, pickup("WELCOME10"))

    expect(review.problems).not.toEqual([])
    expect(review.canPlace).toBe(false)
    expect(review.subtotal).toBe(579_500)
    expect(review.voucher).toMatchObject({ kind: "applied", discount: 57_950 })
  })

  it("V15: a code of 300 characters is a malformed request", async () => {
    const p = await setup()
    const cart = await cartOf([p.lancool, 1])

    const result = await reviewCheckout(cart, pickup("A".repeat(300)), NOW)

    expect(result).toMatchObject({ ok: false, reason: "invalid" })
    expect(
      !result.ok && result.reason === "invalid" && result.fields
    ).toHaveProperty("voucherCode")
  })

  it("V16: blank text is no code", async () => {
    const p = await setup()
    const cart = await cartOf([p.lancool, 1])

    const { review } = await ok(cart, pickup("   "))

    expect(review.voucher).toEqual({ kind: "none" })
  })

  it("a text that can't be a code is unknown without a lookup", async () => {
    const p = await setup()
    const cart = await cartOf([p.lancool, 1])

    for (const code of ["WELCOME 10", "ß", "ab"]) {
      const { review } = await ok(cart, pickup(code))
      expect(review.voucher).toEqual({
        kind: "refused",
        refusal: { reason: "unknown" },
      })
    }
  })

  it("reads the voucher fresh: a use taken after the first review is seen by the next", async () => {
    const p = await setup()
    const cart = await cartOf([p.lancool, 2])
    await voucher({ code: "LAST", usageLimit: 1 })

    const first = await ok(cart, pickup("LAST"))
    await db.voucher.update({ where: { code: "LAST" }, data: { usedCount: 1 } })
    const second = await ok(cart, pickup("LAST"))

    expect(first.review.voucher.kind).toBe("applied")
    expect(second.review.voucher).toMatchObject({
      kind: "refused",
      refusal: { reason: "used-up" },
    })
  })
})
