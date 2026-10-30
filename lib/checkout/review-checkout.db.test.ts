import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { warningKey } from "@/lib/build-state/warnings"
import type { BuildItem } from "@/lib/builder"
import { addBuildToCart } from "@/lib/cart/build"
import { newCartId } from "@/lib/cart/id"
import { shippingSeed } from "@/prisma/seed/data/shipping"
import { writeSeed } from "@/prisma/seed/write"
import {
  insertParts,
  itemsWithIds,
  partsOfBuild,
} from "@/test-support/build-fixtures"
import { db, FIXTURE_TODAY, resetCatalog } from "@/test-support/db"
import { buildA, seed } from "@/test-support/seed-parts"

import { problemText } from "./copy"
import { reviewCheckout } from "./review-checkout"

// docs/specs/029-checkout-steps: the cart-backed review (R1–R4, R8, R10–R12,
// R14, R15, R17, I10–I13, I15, AD1–AD3). Every product weighs 100 g in these
// fixtures, so weights are 100 g × units.

beforeEach(async () => {
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

async function setup(
  overrides: NonNullable<Parameters<typeof insertParts>[1]> = {}
) {
  const parts = new Map(
    [...partsOfBuild(buildA()), seed.proB760mDdr4].map((part) => [
      part.id,
      part,
    ])
  )
  const ids = await insertParts([...parts.values()], {
    [seed.ryzen5_7600.id]: { price: 1_149_500 },
    ...overrides,
  })
  return {
    id: (part: { id: string }) => ids.get(part.id)!,
    items: (build: Parameters<typeof itemsWithIds>[0]) =>
      itemsWithIds(build, ids),
  }
}

const emptyCart = async () =>
  (
    await db.cart.create({
      data: { id: newCartId() },
      select: { id: true },
    })
  ).id

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

const stockOf = (productId: string, stock: number) =>
  db.product.update({ where: { id: productId }, data: { stock } })

async function ok(cartId: string | null, input: unknown) {
  const result = await reviewCheckout(cartId, input)
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
  return result
}

describe("a clean cart", () => {
  it("R1: Ryzen 5 7600 × 2 to Quezon City", async () => {
    const { id } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.ryzen5_7600), 2)

    const { review, address, contact: parsed } = await ok(cart, delivery())

    expect(review.subtotal).toBe(2_299_000)
    expect(review.weightGrams).toBe(200)
    expect(review.shipping).toEqual({ ok: true, fee: 12_000, basis: "rate" })
    expect(review.total).toBe(2_311_000)
    expect(review.problems).toEqual([])
    expect(review.canPlace).toBe(true)
    expect(address).toMatchObject({
      province: { name: "Metro Manila", code: null },
      city: { name: "Quezon City" },
      barangay: { name: "Alicia" },
      zone: "metro-manila",
      street: "12 Mabini St",
      zip: "1100",
    })
    expect(parsed.mobile).toBe("+639171234567")
  })

  it("R2: a Build A group for pickup shows the store", async () => {
    const { items } = await setup()
    const cart = await emptyCart()
    await addBuild(items(buildA()), cart)

    const { review, address, store } = await ok(cart, pickup)

    expect(review.shipping).toMatchObject({ fee: 0, basis: "pickup" })
    expect(review.total).toBe(review.subtotal)
    expect(address).toBeNull()
    expect(store?.address).toContain("PC Silicon Demo Store")
    expect(store?.hours).toContain("Mon–Sat")
  })

  it("R4: Build A to Davao pays the Mindanao first tier (800 g)", async () => {
    const { items } = await setup()
    const cart = await emptyCart()
    await addBuild(items(buildA()), cart)

    const { review } = await ok(cart, delivery(DAVAO))

    expect(review.weightGrams).toBe(800)
    expect(review.shipping).toMatchObject({ ok: true, fee: 21_000 })
  })

  it("AD1–AD3: Cebu and Mandaue, by either path, give one address", async () => {
    const { id } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    const mandaue = {
      regionCode: "0700000000",
      provinceCode: "0702200000",
      cityCode: "0731300000",
      barangayCode: "0731300001",
      street: "5 A St",
      zip: "6014",
    }

    const viaCebu = await ok(cart, delivery(mandaue))
    const viaOwn = await ok(
      cart,
      delivery({ ...mandaue, provinceCode: "0731300000" })
    )

    expect(viaCebu.address).toEqual(viaOwn.address)
    expect(viaCebu.address).toMatchObject({
      province: { name: "Cebu", code: null, geographic: true },
      zone: "visayas",
    })
    expect(viaCebu.review.shipping).toMatchObject({ fee: 19_000 })
  })
})

describe("problems", () => {
  it("R8: a line over stock blocks, with totals", async () => {
    const { id } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.ryzen5_7600), 3)
    await stockOf(id(seed.ryzen5_7600), 2)

    const { review } = await ok(cart, delivery())

    expect(review.canPlace).toBe(false)
    expect(review.problems.map(problemText)).toEqual([
      "AMD Ryzen 5 7600: Only 2 in stock, 3 in your cart",
    ])
    expect(review.total).toBe(3_448_500 + 12_000)
  })

  it("R9: the single line and the group part both carry it", async () => {
    const { id, items } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    await addBuild(items(buildA()), cart)
    await stockOf(id(seed.ryzen5_7600), 1)

    const { review } = await ok(cart, delivery())

    expect(review.problems.map(problemText)).toEqual([
      "AMD Ryzen 5 7600: Only 1 in stock, 2 in your cart",
      "Custom PC build: AMD Ryzen 5 7600: Only 1 in stock, 2 in your cart",
    ])
  })

  it("R10: out of stock", async () => {
    const { id } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.lancool216), 1)
    await stockOf(id(seed.lancool216), 0)

    const { review } = await ok(cart, delivery())

    expect(review.problems.map(problemText)).toEqual([
      "Lian Li LANCOOL 216 Black: Out of stock",
    ])
  })

  it("R11: a retired part of a group blocks and leaves the totals", async () => {
    const { id, items } = await setup()
    const cart = await emptyCart()
    await addBuild(items(buildA()), cart)
    await db.product.update({
      where: { id: id(seed.rtx4060) },
      data: { status: "DRAFT" },
    })

    const { review } = await ok(cart, delivery())

    expect(review.canPlace).toBe(false)
    expect(review.problems.map(problemText)).toContain(
      `Custom PC build: ${seed.rtx4060.name}: No longer sold`
    )
    expect(review.weightGrams).toBe(700)
  })

  it("R12: a group with errors blocks and keeps its messages", async () => {
    const { id } = await setup()
    const cart = await emptyCart()
    // Build A with the Intel board in place of the Strix, inserted directly
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

    const { review } = await ok(cart, delivery())

    expect(review.canPlace).toBe(false)
    const problem = review.problems.find((p) => p.kind === "build-errors")
    expect(problem).toBeDefined()
    expect(problem && problemText(problem)).toBe("Custom PC build has errors:")
  })

  it("R14, R15: no rate blocks delivery and never pickup", async () => {
    const { id } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    await db.shippingRate.deleteMany({ where: { zone: "MINDANAO" } })

    const blocked = await ok(cart, delivery(DAVAO))
    expect(blocked.review.shipping).toEqual({ ok: false, reason: "no-rate" })
    expect(blocked.review.total).toBeNull()
    expect(blocked.review.problems.map(problemText)).toEqual([
      "We can't deliver to Region XI (Davao Region) yet. Choose store pickup or another address.",
    ])

    const picked = await ok(cart, pickup)
    expect(picked.review.canPlace).toBe(true)
  })
})

describe("empty and invalid", () => {
  it("R17: no cart, an unknown cart, or no lines is empty", async () => {
    await setup()
    expect(await reviewCheckout(null, delivery())).toEqual({
      ok: false,
      reason: "empty",
    })
    expect(await reviewCheckout(newCartId(), delivery())).toEqual({
      ok: false,
      reason: "empty",
    })
    expect(await reviewCheckout(await emptyCart(), delivery())).toEqual({
      ok: false,
      reason: "empty",
    })
  })

  it("I10: a barangay of another city is sent back to the barangay", async () => {
    const { id } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.ryzen5_7600), 1)

    const result = await reviewCheckout(
      cart,
      delivery({ ...QC, cityCode: "1380300000" })
    )

    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      fields: { "address.barangayCode": "Choose your barangay again." },
    })
  })

  it("I11: a province from another region is sent back to the province", async () => {
    const { id } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.ryzen5_7600), 1)

    const result = await reviewCheckout(
      cart,
      delivery({ ...QC, regionCode: "0800000000", provinceCode: "0702200000" })
    )

    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      fields: { "address.provinceCode": "Choose your province again." },
    })
  })

  it("a field that fails the schema comes back by its path", async () => {
    const result = await reviewCheckout(null, delivery({ ...QC, zip: "110" }))
    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      fields: { "address.zip": "Enter a 4-digit ZIP code." },
    })
  })

  it("I15: pickup while it is turned off", async () => {
    const { id } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    await db.storeSettings.update({
      where: { id: 1 },
      data: { pickupEnabled: false },
    })

    expect(await reviewCheckout(cart, pickup)).toEqual({
      ok: false,
      reason: "invalid",
      fields: {
        method: "Store pickup isn't available right now. Choose delivery.",
      },
    })
  })

  it("I13: names, fees and a cart id in the request are ignored", async () => {
    const { id } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.ryzen5_7600), 1)

    const { review, address } = await ok(cart, {
      ...delivery({ ...QC, regionName: "Fake" }),
      fee: 0,
      subtotal: 1,
      cartId: "someone-else",
    })

    expect(address?.region.name).toBe("National Capital Region (NCR)")
    expect(review.subtotal).toBe(1_149_500)
    expect(review.shipping).toMatchObject({ fee: 12_000 })
  })
})

describe("it only reads", () => {
  it("writes nothing and doesn't touch the cart", async () => {
    const { id, items } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.ryzen5_7600), 2)
    await addBuild(items(buildA()), cart)
    const snapshot = async () => ({
      carts: await db.cart.findMany({ orderBy: { id: "asc" } }),
      lines: await db.cartItem.findMany({ orderBy: { id: "asc" } }),
      builds: await db.build.count(),
      products: await db.product.findMany({ orderBy: { id: "asc" } }),
    })
    const before = await snapshot()

    await ok(cart, delivery())
    await ok(cart, pickup)
    await reviewCheckout(cart, delivery({ ...QC, cityCode: "1380300000" }))

    expect(await snapshot()).toEqual(before)
  })
})
