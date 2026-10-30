import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { db, FIXTURE_TODAY, resetCatalog } from "@/test-support/db"
import { insertParts } from "@/test-support/build-fixtures"
import { seed } from "@/test-support/seed-parts"

import {
  addToCart,
  getCartCount,
  getCartView,
  removeFromCart,
  setCartQuantity,
} from "./cart"
import { isCartId, newCartId } from "./id"
import { singleLines } from "./types"

// The cart (docs/specs/025-cart-single-items): adding, merging, the stock cap
// across lines, setting, removing, the cookie's cart, and concurrent adds.
// Stock in brackets, as in the spec's examples.

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

type Overrides = NonNullable<Parameters<typeof insertParts>[1]>

// The products the cart tests use, by seed key, with the database ids
async function products(overrides: Record<string, Overrides[string]> = {}) {
  const parts = [
    seed.ryzen5_7600,
    seed.ryzen7_9800x3d,
    seed.ryzen5_5600,
    seed.ultra7_265k,
  ]
  const byId = await insertParts(
    parts,
    Object.fromEntries(
      Object.entries(overrides).map(([key, value]) => [
        seed[key as keyof typeof seed].id,
        value,
      ])
    )
  )
  const id = (part: { id: string }) => byId.get(part.id)!
  return {
    ryzen: id(seed.ryzen5_7600),
    x3d: id(seed.ryzen7_9800x3d),
    r5600: id(seed.ryzen5_5600),
    ultra: id(seed.ultra7_265k),
  }
}

const emptyCart = async () => {
  const { id } = await db.cart.create({
    data: { id: newCartId() },
    select: { id: true },
  })
  return id
}

let buildCount = 0
// A build for group lines; #62 makes them, the tests insert them directly
const makeBuild = async () => {
  buildCount += 1
  const { id } = await db.build.create({
    data: {
      shareSlug: `cart-test-${buildCount}-${Date.now()}`.slice(0, 10),
      contentHash: `hash-${buildCount}-${Date.now()}`,
    },
    select: { id: true },
  })
  return id
}

const lineOf = (cartId: string, productId: string, quantity: number) =>
  db.cartItem.create({ data: { cartId, productId, quantity } })

const groupLine = async (
  cartId: string,
  productId: string,
  quantity: number,
  buildId?: string
) =>
  db.cartItem.create({
    data: {
      cartId,
      productId,
      quantity,
      buildId: buildId ?? (await makeBuild()),
    },
  })

const add = (cartId: string | null, productId: string, quantity: number) =>
  addToCart({ productId, quantity }, { cartId, today: FIXTURE_TODAY })

const set = (cartId: string | null, lineId: string, quantity: number) =>
  setCartQuantity({ lineId, quantity }, { cartId, today: FIXTURE_TODAY })

const remove = (cartId: string | null, lineId: string) =>
  removeFromCart({ lineId }, { cartId, today: FIXTURE_TODAY })

const singles = (cartId: string) =>
  db.cartItem.findMany({
    where: { cartId, buildId: null },
    orderBy: { createdAt: "asc" },
  })

const okResult = (outcome: Awaited<ReturnType<typeof add>>) => {
  if (!outcome.result.ok) throw new Error(`failed: ${outcome.result.reason}`)
  return outcome.result
}

const nothingWritten = async () => {
  expect(await db.cart.count()).toBe(0)
  expect(await db.cartItem.count()).toBe(0)
}

describe("addToCart", () => {
  it("E1: the first add makes a cart and one line", async () => {
    const { ryzen } = await products()

    const outcome = await add(null, ryzen, 2)

    const result = okResult(outcome)
    expect(result).toMatchObject({ count: 2, added: 2 })
    expect(result.line?.quantity).toBe(2)
    expect(result.note).toBeUndefined()
    expect(outcome.renewCookie).toBe(true)
    expect(isCartId(outcome.cartId)).toBe(true)
    expect(await db.cart.count()).toBe(1)
    const lines = await db.cartItem.findMany()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      cartId: outcome.cartId,
      productId: ryzen,
      quantity: 2,
      buildId: null,
    })
  })

  it("E2: adds into the existing line, not a second one", async () => {
    const { ryzen } = await products()
    const first = await add(null, ryzen, 2)

    const second = await add(first.cartId, ryzen, 1)

    expect(okResult(second)).toMatchObject({ count: 3, added: 1 })
    expect(second.cartId).toBe(first.cartId)
    const lines = await singles(first.cartId!)
    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe(3)
  })

  it("E3 [5]: the line has 3, add 3 → 5, with the note", async () => {
    const { ryzen } = await products({ ryzen5_7600: { stock: 5 } })
    const cart = await emptyCart()
    await lineOf(cart, ryzen, 3)

    const result = okResult(await add(cart, ryzen, 3))

    expect(result).toMatchObject({ added: 2, count: 5 })
    expect(result.line?.quantity).toBe(5)
    expect(result.note).toEqual({ kind: "stock", stock: 5, total: 5 })
  })

  it("E4 [5]: an empty cart, add 7 → 5", async () => {
    const { ryzen } = await products({ ryzen5_7600: { stock: 5 } })

    const result = okResult(await add(null, ryzen, 7))

    expect(result).toMatchObject({ added: 5, count: 5 })
    expect(result.note).toEqual({ kind: "stock", stock: 5, total: 5 })
  })

  it("E5 [5]: already at the cap adds nothing, and the cookie is still renewed (E47)", async () => {
    const { ryzen } = await products({ ryzen5_7600: { stock: 5 } })
    const cart = await emptyCart()
    await lineOf(cart, ryzen, 5)

    const outcome = await add(cart, ryzen, 1)

    const result = okResult(outcome)
    expect(result).toMatchObject({ added: 0, count: 5 })
    expect(result.line?.quantity).toBe(5)
    expect(result.note).toBeDefined()
    expect(outcome.renewCookie).toBe(true)
  })

  it("E6 [3]: a build group holds 2, add 2 → the single line gets 1", async () => {
    const { ryzen } = await products({ ryzen5_7600: { stock: 3 } })
    const cart = await emptyCart()
    await groupLine(cart, ryzen, 2)

    const result = okResult(await add(cart, ryzen, 2))

    expect(result.added).toBe(1)
    expect(result.line?.quantity).toBe(1)
    expect(result.note).toEqual({ kind: "stock", stock: 3, total: 3 })
  })

  it("E7 [2]: a build group holds 2, add 1 → nothing, and no line is made", async () => {
    const { ryzen } = await products({ ryzen5_7600: { stock: 2 } })
    const cart = await emptyCart()
    await groupLine(cart, ryzen, 2)

    const result = okResult(await add(cart, ryzen, 1))

    expect(result.added).toBe(0)
    expect(result.line).toBeNull()
    expect(result.note).toEqual({ kind: "stock", stock: 2, total: 2 })
    expect(await singles(cart)).toHaveLength(0)
  })

  it("E8: another product is a second line, and a low-stock part can be added", async () => {
    const { ryzen, x3d } = await products({ ryzen7_9800x3d: { stock: 4 } })
    const first = await add(null, ryzen, 1)

    const result = okResult(await add(first.cartId, x3d, 1))

    expect(result.count).toBe(2)
    expect(await singles(first.cartId!)).toHaveLength(2)
  })

  it("E15 [500]: the 99 limit", async () => {
    const { ryzen } = await products({ ryzen5_7600: { stock: 500 } })
    const cart = await emptyCart()
    await lineOf(cart, ryzen, 98)

    const result = okResult(await add(cart, ryzen, 5))

    expect(result.added).toBe(1)
    expect(result.line?.quantity).toBe(99)
    expect(result.note).toEqual({ kind: "max", max: 99 })
  })

  it("E9: parts that can't be bought change nothing and make no cart", async () => {
    const { ryzen, x3d, r5600, ultra } = await products({
      ryzen5_7600: { stock: 0 },
      ryzen7_9800x3d: { status: "DRAFT" },
      ultra7_265k: { preorderShipsOn: "2027-02-01" },
    })

    for (const id of [ryzen, x3d, ultra, "no-such-product"]) {
      const outcome = await add(null, id, 1)
      expect(outcome).toEqual({
        result: { ok: false, reason: "unavailable" },
        cartId: null,
        renewCookie: false,
      })
    }
    expect(r5600).toBeDefined()
    await nothingWritten()
  })

  it("E10: bad input is invalid and writes nothing", async () => {
    const { ryzen } = await products()
    const inputs: unknown[] = [
      { productId: ryzen, quantity: 0 },
      { productId: ryzen, quantity: -1 },
      { productId: ryzen, quantity: 1.5 },
      { productId: ryzen, quantity: "2" },
      { productId: ryzen, quantity: 100 },
      { quantity: 1 },
      { productId: "", quantity: 1 },
      null,
      "ryzen",
    ]

    for (const input of inputs) {
      const outcome = await addToCart(input, {
        cartId: null,
        today: FIXTURE_TODAY,
      })
      expect(outcome.result).toEqual({ ok: false, reason: "invalid" })
      expect(outcome.renewCookie).toBe(false)
    }
    await nothingWritten()
  })

  it("E11: a cart id in the body is ignored", async () => {
    const { ryzen } = await products()
    const other = await emptyCart()

    const outcome = await addToCart(
      { productId: ryzen, quantity: 1, cartId: other },
      { cartId: null, today: FIXTURE_TODAY }
    )

    expect(outcome.cartId).not.toBe(other)
    expect(await singles(other)).toHaveLength(0)
    expect(await singles(outcome.cartId!)).toHaveLength(1)
  })

  it.each([newCartId(), "x"])(
    "E12: a cookie for a cart that doesn't exist (%s) starts a new cart",
    async (stale) => {
      const { ryzen } = await products()

      const outcome = await add(stale, ryzen, 1)

      expect(okResult(outcome).count).toBe(1)
      expect(outcome.cartId).not.toBe(stale)
      expect(isCartId(outcome.cartId)).toBe(true)
      expect(await db.cart.count()).toBe(1)
    }
  )

  it("E50: an expired cookie leaves the old cart alone and starts another", async () => {
    const { ryzen } = await products()
    const old = await emptyCart()
    await lineOf(old, ryzen, 2)

    const outcome = await add(null, ryzen, 1)

    expect(outcome.cartId).not.toBe(old)
    expect(okResult(outcome).count).toBe(1)
    expect((await singles(old))[0].quantity).toBe(2)
  })

  it("E45: an add to an existing cart keeps its id and renews the cookie", async () => {
    const { ryzen } = await products()
    const cart = await emptyCart()

    const outcome = await add(cart, ryzen, 1)

    expect(outcome.cartId).toBe(cart)
    expect(outcome.renewCookie).toBe(true)
  })

  it("marks the cart as in use", async () => {
    const { ryzen } = await products()
    const cart = await emptyCart()
    const before = (await db.cart.findUniqueOrThrow({ where: { id: cart } }))
      .updatedAt

    await new Promise((resolve) => setTimeout(resolve, 20))
    await add(cart, ryzen, 1)

    const after = (await db.cart.findUniqueOrThrow({ where: { id: cart } }))
      .updatedAt
    expect(after.getTime()).toBeGreaterThan(before.getTime())
  })

  it("E13: two adds at the same moment make one line", async () => {
    const { ryzen } = await products({ ryzen5_7600: { stock: 12 } })
    const cart = await emptyCart()

    const [a, b] = await Promise.all([add(cart, ryzen, 2), add(cart, ryzen, 2)])

    expect(a.result.ok && b.result.ok).toBe(true)
    const lines = await singles(cart)
    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe(4)
  })

  it("E14 [5]: the cap holds when two adds of 3 arrive at the same moment", async () => {
    const { ryzen } = await products({ ryzen5_7600: { stock: 5 } })
    const cart = await emptyCart()

    const outcomes = await Promise.all([
      add(cart, ryzen, 3),
      add(cart, ryzen, 3),
    ])

    const lines = await singles(cart)
    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe(5)
    expect(outcomes.map((o) => okResult(o).added).sort()).toEqual([2, 3])
    expect(outcomes.filter((o) => okResult(o).note)).toHaveLength(1)
  })

  it("keeps many adds at the same moment to the cap and one line", async () => {
    const { ryzen } = await products({ ryzen5_7600: { stock: 7 } })
    const cart = await emptyCart()

    await Promise.all(Array.from({ length: 10 }, () => add(cart, ryzen, 1)))

    const lines = await singles(cart)
    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe(7)
  })
})

describe("setCartQuantity", () => {
  it("E16: lowers a line", async () => {
    const { ryzen } = await products()
    const cart = await emptyCart()
    const line = await lineOf(cart, ryzen, 3)

    const outcome = await set(cart, line.id, 1)

    expect(okResult(outcome)).toMatchObject({
      count: 1,
      line: { id: line.id, quantity: 1 },
    })
    expect(outcome.renewCookie).toBe(true)
    expect((await singles(cart))[0].quantity).toBe(1)
  })

  it("E17 [2]: a build group holds 1; the single line stays at 1", async () => {
    const { ryzen } = await products({ ryzen5_7600: { stock: 2 } })
    const cart = await emptyCart()
    await groupLine(cart, ryzen, 1)
    const line = await lineOf(cart, ryzen, 1)

    const result = okResult(await set(cart, line.id, 2))

    expect(result.line?.quantity).toBe(1)
    expect(result.note).toEqual({ kind: "stock", stock: 2, total: 2 })
  })

  it("E18 [5]: single 2 → 4 next to a group of 1", async () => {
    const { ryzen } = await products({ ryzen5_7600: { stock: 5 } })
    const cart = await emptyCart()
    await groupLine(cart, ryzen, 1)
    const line = await lineOf(cart, ryzen, 2)

    const result = okResult(await set(cart, line.id, 4))

    expect(result.line?.quantity).toBe(4)
    expect(result.note).toBeUndefined()
  })

  it("E19 [2]: stock dropped under the line; raising keeps it, with the note", async () => {
    const { ryzen } = await products({ ryzen5_7600: { stock: 2 } })
    const cart = await emptyCart()
    const line = await lineOf(cart, ryzen, 3)

    const result = okResult(await set(cart, line.id, 4))

    expect(result.line?.quantity).toBe(3)
    expect(result.note).toEqual({ kind: "stock", stock: 2, total: 3 })
  })

  it("E20 [2]: lowering works without a note", async () => {
    const { ryzen } = await products({ ryzen5_7600: { stock: 2 } })
    const cart = await emptyCart()
    const line = await lineOf(cart, ryzen, 3)

    const result = okResult(await set(cart, line.id, 2))

    expect(result.line?.quantity).toBe(2)
    expect(result.note).toBeUndefined()
  })

  it("E21: bad input is invalid and changes nothing", async () => {
    const { ryzen } = await products()
    const cart = await emptyCart()
    const line = await lineOf(cart, ryzen, 1)

    for (const input of [
      { lineId: line.id, quantity: 0 },
      { lineId: line.id, quantity: -1 },
      { lineId: line.id, quantity: 1.5 },
      { lineId: line.id, quantity: 100 },
      { lineId: "", quantity: 1 },
    ]) {
      const outcome = await setCartQuantity(input, {
        cartId: cart,
        today: FIXTURE_TODAY,
      })
      expect(outcome.result).toEqual({ ok: false, reason: "invalid" })
    }
    expect((await singles(cart))[0].quantity).toBe(1)
  })

  it("E23: another cart's line has no effect", async () => {
    const { ryzen } = await products()
    const mine = await emptyCart()
    const theirs = await emptyCart()
    const line = await lineOf(theirs, ryzen, 2)

    const outcome = await set(mine, line.id, 1)

    expect(outcome.result).toEqual({ ok: false, reason: "not-found" })
    expect(outcome.renewCookie).toBe(false)
    expect((await singles(theirs))[0].quantity).toBe(2)
  })

  it("E24: no cart, or an unknown one, is not found and makes no cart", async () => {
    const { ryzen } = await products()
    const cart = await emptyCart()
    const line = await lineOf(cart, ryzen, 1)

    for (const cartId of [null, newCartId()]) {
      expect((await set(cartId, line.id, 2)).result).toEqual({
        ok: false,
        reason: "not-found",
      })
    }
    expect(await db.cart.count()).toBe(1)
  })

  it("E25: a build group's line can't be set one by one", async () => {
    const { ryzen } = await products()
    const cart = await emptyCart()
    const line = await groupLine(cart, ryzen, 1)

    expect((await set(cart, line.id, 2)).result).toEqual({
      ok: false,
      reason: "not-found",
    })
    expect((await remove(cart, line.id)).result).toEqual({
      ok: false,
      reason: "not-found",
    })
    expect(await db.cartItem.count()).toBe(1)
  })

  it("E26: a part that is no longer sold can be lowered but not raised", async () => {
    const { ryzen } = await products()
    const cart = await emptyCart()
    const line = await lineOf(cart, ryzen, 3)
    await db.product.update({ where: { id: ryzen }, data: { status: "DRAFT" } })

    const raise = await set(cart, line.id, 4)
    const lower = await set(cart, line.id, 2)

    expect(raise.result).toEqual({ ok: false, reason: "unavailable" })
    expect(raise.renewCookie).toBe(false)
    expect(okResult(lower).line?.quantity).toBe(2)
  })
})

describe("removeFromCart", () => {
  it("E22: removes a line and counts the rest", async () => {
    const { ryzen, x3d } = await products()
    const cart = await emptyCart()
    const first = await lineOf(cart, ryzen, 2)
    await lineOf(cart, x3d, 1)

    const outcome = await remove(cart, first.id)

    expect(okResult(outcome)).toMatchObject({ count: 1, line: null })
    expect(outcome.renewCookie).toBe(true)
    expect(await singles(cart)).toHaveLength(1)
  })

  it("removes the last line and leaves an empty cart", async () => {
    const { ryzen } = await products()
    const cart = await emptyCart()
    const line = await lineOf(cart, ryzen, 1)

    expect(okResult(await remove(cart, line.id)).count).toBe(0)
    expect(await db.cart.count()).toBe(1)
  })

  it("works for a product that is no longer sold", async () => {
    const { ryzen } = await products()
    const cart = await emptyCart()
    const line = await lineOf(cart, ryzen, 1)
    await db.product.update({ where: { id: ryzen }, data: { status: "DRAFT" } })

    expect((await remove(cart, line.id)).result.ok).toBe(true)
  })

  it("E23/E24: another cart's line, no cart or an unknown line is not found", async () => {
    const { ryzen } = await products()
    const mine = await emptyCart()
    const theirs = await emptyCart()
    const line = await lineOf(theirs, ryzen, 2)

    for (const [cartId, lineId] of [
      [mine, line.id],
      [null, line.id],
      [newCartId(), line.id],
      [theirs, "no-such-line"],
    ] as const) {
      const outcome = await remove(cartId, lineId)
      expect(outcome.result).toEqual({ ok: false, reason: "not-found" })
      expect(outcome.renewCookie).toBe(false)
    }
    expect(await singles(theirs)).toHaveLength(1)
  })

  it("rejects an empty line id as invalid", async () => {
    const cart = await emptyCart()

    expect((await remove(cart, "")).result).toEqual({
      ok: false,
      reason: "invalid",
    })
  })
})

describe("reading the cart", () => {
  it("E27: lines at current prices, oldest first, and the subtotal", async () => {
    const { ryzen, r5600 } = await products({
      ryzen5_7600: { price: 1_149_500 },
      ryzen5_5600: { price: 1_249_500 },
    })
    await db.product.update({
      where: { id: r5600 },
      data: { salePrice: 1_099_500 },
    })
    const cart = await emptyCart()
    await lineOf(cart, ryzen, 2)
    await lineOf(cart, r5600, 1)

    const view = await getCartView(cart, FIXTURE_TODAY)

    expect(singleLines(view).map((line) => line.productId)).toEqual([
      ryzen,
      r5600,
    ])
    expect(singleLines(view)[0]).toMatchObject({
      unitPrice: 1_149_500,
      lineTotal: 2_299_000,
      price: 1_149_500,
      salePrice: null,
      status: "in-stock",
      sold: true,
    })
    expect(singleLines(view)[1]).toMatchObject({
      unitPrice: 1_099_500,
      price: 1_249_500,
      salePrice: 1_099_500,
      lineTotal: 1_099_500,
    })
    expect(view.subtotal).toBe(3_398_500)
    expect(view.count).toBe(3)
    expect(await getCartCount(cart)).toBe(3)
  })

  it("E28: prices are read fresh, never stored in the cart", async () => {
    const { ryzen } = await products({ ryzen5_7600: { price: 1_149_500 } })
    const cart = await emptyCart()
    await lineOf(cart, ryzen, 2)

    await db.product.update({
      where: { id: ryzen },
      data: { price: 1_000_000 },
    })

    const view = await getCartView(cart, FIXTURE_TODAY)
    expect(singleLines(view)[0]).toMatchObject({
      unitPrice: 1_000_000,
      lineTotal: 2_000_000,
    })
    expect(view.subtotal).toBe(2_000_000)
  })

  it("E29: no cart, or an unknown one, is empty and makes nothing", async () => {
    for (const cartId of [null, newCartId()]) {
      expect(await getCartView(cartId, FIXTURE_TODAY)).toEqual({
        entries: [],
        subtotal: 0,
        count: 0,
      })
      expect(await getCartCount(cartId)).toBe(0)
    }
    await nothingWritten()
  })

  it("E29: a cart with no lines is empty", async () => {
    const cart = await emptyCart()

    expect(singleLines(await getCartView(cart, FIXTURE_TODAY))).toEqual([])
    expect(await getCartCount(cart)).toBe(0)
  })

  it("E30: a low-stock part says so", async () => {
    const { x3d } = await products({ ryzen7_9800x3d: { stock: 4 } })
    const cart = await emptyCart()
    await lineOf(cart, x3d, 1)

    expect(singleLines(await getCartView(cart, FIXTURE_TODAY))[0].status).toBe(
      "low-stock"
    )
  })

  it("E31: a retired part stays as a line but leaves the subtotal", async () => {
    const { ryzen, x3d } = await products({ ryzen5_7600: { price: 1_149_500 } })
    const cart = await emptyCart()
    await lineOf(cart, ryzen, 1)
    await lineOf(cart, x3d, 2)
    await db.product.update({ where: { id: x3d }, data: { status: "DRAFT" } })

    const view = await getCartView(cart, FIXTURE_TODAY)

    expect(singleLines(view)).toHaveLength(2)
    expect(singleLines(view)[1]).toMatchObject({ sold: false, max: 2 })
    expect(view.subtotal).toBe(1_149_500)
    expect(view.count).toBe(3)
  })

  it("lists single lines only, and counts a build group as one", async () => {
    const { ryzen, x3d, r5600 } = await products()
    const cart = await emptyCart()
    await lineOf(cart, ryzen, 1)
    const build = await makeBuild()
    await groupLine(cart, x3d, 1, build)
    await groupLine(cart, r5600, 2, build)

    const view = await getCartView(cart, FIXTURE_TODAY)

    expect(singleLines(view)).toHaveLength(1)
    expect(view.count).toBe(2)
    expect(await getCartCount(cart)).toBe(2)
  })

  it("the most a line can be raised to counts the product's build groups", async () => {
    const { ryzen } = await products({ ryzen5_7600: { stock: 5 } })
    const cart = await emptyCart()
    await groupLine(cart, ryzen, 2)
    await lineOf(cart, ryzen, 1)

    expect(singleLines(await getCartView(cart, FIXTURE_TODAY))[0].max).toBe(3)
  })
})
