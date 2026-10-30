import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { shareBuild } from "@/lib/build-share"
import { warningKey } from "@/lib/build-state/warnings"
import type { BuildItem } from "@/lib/builder"
import { db, FIXTURE_TODAY, resetCatalog } from "@/test-support/db"
import {
  insertParts,
  itemsWithIds,
  partsOfBuild,
  UNKNOWN_PRODUCT_ID,
} from "@/test-support/build-fixtures"
import { buildA, buildB, seed, swap } from "@/test-support/seed-parts"

import { addBuildToCart, removeBuildFromCart } from "./build"
import {
  addToCart,
  getCartCount,
  getCartView,
  removeFromCart,
  setCartQuantity,
} from "./cart"
import { newCartId } from "./id"
import { singleLines } from "./types"

// Add build to cart (docs/specs/026-add-build-to-cart, E1–E31, E32–E39,
// E56–E60). Build A is the compatible build; Build B has one warning (BIOS);
// Build B′ is B with the MWE 550 and has two; Build A× has errors.

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

type Overrides = NonNullable<Parameters<typeof insertParts>[1]>

const buildBPrime = () => swap(buildB(), seed.mwe550)
const buildAx = () => swap(buildA(), seed.proB760mDdr4)
const buildAx3d = () => swap(buildA(), seed.ryzen7_9800x3d)
const buildAKit2 = () => ({
  ...buildA(),
  memory: [{ part: seed.vengeanceDdr5, quantity: 2 }],
})

// Every part the examples use, once, with the database ids by seed id
async function setup(overrides: Overrides = {}) {
  const parts = new Map(
    [
      ...partsOfBuild(buildA()),
      ...partsOfBuild(buildB()),
      ...partsOfBuild(buildBPrime()),
      ...partsOfBuild(buildAx()),
      seed.ryzen7_9800x3d,
    ].map((part) => [part.id, part])
  )
  const ids = await insertParts([...parts.values()], overrides)
  return {
    ids,
    id: (part: { id: string }) => ids.get(part.id)!,
    items: (build: Parameters<typeof itemsWithIds>[0]) =>
      itemsWithIds(build, ids),
  }
}

const emptyCart = async () => {
  const { id } = await db.cart.create({
    data: { id: newCartId() },
    select: { id: true },
  })
  return id
}

const add = (
  items: unknown,
  cartId: string | null,
  acknowledgedWarnings: string[] = []
) =>
  addBuildToCart(
    { items, acknowledgedWarnings },
    { cartId, today: FIXTURE_TODAY }
  )

// What a client does after a `confirm`: send the same items with the keys of
// the warnings the server named
async function addConfirmed(items: BuildItem[], cartId: string | null) {
  const first = await add(items, cartId)
  if (first.result.ok || first.result.reason !== "confirm") return first
  return add(items, cartId, first.result.warnings.map(warningKey))
}

const counts = async () => ({
  carts: await db.cart.count(),
  builds: await db.build.count(),
  buildItems: await db.buildItem.count(),
  cartItems: await db.cartItem.count(),
})
const NOTHING = { carts: 0, builds: 0, buildItems: 0, cartItems: 0 }

describe("adding a build", () => {
  it("E1: stores the snapshot and 8 group lines in a new cart", async () => {
    const { items, ids } = await setup()

    const { result, cartId, renewCookie } = await add(items(buildA()), null)

    expect(result).toEqual({ ok: true, status: "added", count: 1 })
    expect(renewCookie).toBe(true)
    expect(await counts()).toEqual({
      carts: 1,
      builds: 1,
      buildItems: 8,
      cartItems: 8,
    })
    const lines = await db.cartItem.findMany({ where: { cartId: cartId! } })
    const build = await db.build.findFirstOrThrow()
    expect(lines.every((line) => line.buildId === build.id)).toBe(true)
    expect(lines.every((line) => line.quantity === 1)).toBe(true)
    expect(new Set(lines.map((line) => line.productId))).toEqual(
      new Set(
        ids.values().filter((id) => lines.some((l) => l.productId === id))
      )
    )
  })

  it("E2: reuses a snapshot that was shared before", async () => {
    const { items } = await setup()
    const shared = await shareBuild(items(buildA()), { today: FIXTURE_TODAY })
    if (!shared.ok) throw new Error("setup")

    const { result } = await add(items(buildA()), null)

    expect(result).toMatchObject({ ok: true, status: "added" })
    const builds = await db.build.findMany()
    expect(builds).toHaveLength(1)
    expect(builds[0].shareSlug).toBe(shared.slug)
    expect(await db.cartItem.count({ where: { buildId: builds[0].id } })).toBe(
      8
    )
  })

  it("E3: the same build again is already in the cart and changes nothing", async () => {
    const { items } = await setup()
    const first = await add(items(buildA()), null)

    const again = await add(items(buildA()), first.cartId)

    expect(again.result).toEqual({
      ok: true,
      status: "already-in-cart",
      count: 1,
    })
    expect(again.renewCookie).toBe(true)
    expect(again.cartId).toBe(first.cartId)
    expect(await counts()).toEqual({
      carts: 1,
      builds: 1,
      buildItems: 8,
      cartItems: 8,
    })
  })

  it("E4: different contents are a second group", async () => {
    const { items } = await setup()
    const first = await add(items(buildA()), null)

    const second = await add(items(buildAKit2()), first.cartId)

    expect(second.result).toEqual({ ok: true, status: "added", count: 2 })
    expect(await db.build.count()).toBe(2)
    expect(await db.cartItem.count()).toBe(16)
    const kit = await db.cartItem.findFirst({
      where: { quantity: 2 },
    })
    expect(kit).not.toBeNull()
  })

  it("E5: a product can be a single item and in a group, on separate lines", async () => {
    const { items, id } = await setup()
    const single = await addToCart(
      { productId: id(seed.ryzen5_7600), quantity: 1 },
      { cartId: null, today: FIXTURE_TODAY }
    )

    const { result } = await add(items(buildA()), single.cartId)

    expect(result).toEqual({ ok: true, status: "added", count: 2 })
    const lines = await db.cartItem.findMany({
      where: { productId: id(seed.ryzen5_7600) },
    })
    expect(lines.map((line) => line.buildId === null).sort()).toEqual([
      false,
      true,
    ])
  })

  it("E22: ignores a cart id in the input and uses the cookie's", async () => {
    const { items } = await setup()
    const other = await emptyCart()

    const { result, cartId } = await addBuildToCart(
      { items: items(buildA()), acknowledgedWarnings: [], cartId: other },
      { cartId: null, today: FIXTURE_TODAY }
    )

    expect(result).toMatchObject({ ok: true })
    expect(cartId).not.toBe(other)
    expect(await db.cartItem.count({ where: { cartId: other } })).toBe(0)
  })

  it("E23: a cookie for a cart that doesn't exist starts a new cart", async () => {
    const { items } = await setup()
    const stale = newCartId()

    const { result, cartId } = await add(items(buildA()), stale)

    expect(result).toMatchObject({ ok: true, status: "added" })
    expect(cartId).not.toBe(stale)
    expect(await db.cart.count({ where: { id: cartId! } })).toBe(1)
  })
})

describe("refusing a build", () => {
  it("E6: errors are returned, errors first, and nothing is written", async () => {
    const { items } = await setup()

    const { result, cartId, renewCookie } = await add(items(buildAx()), null)

    expect(result).toMatchObject({ ok: false, reason: "errors" })
    if (result.ok || result.reason !== "errors") throw new Error("shape")
    expect(result.issues.map((issue) => issue.rule)).toEqual([
      "socket-match",
      "memory-type",
    ])
    expect(result.issues.every((issue) => issue.severity === "error")).toBe(
      true
    )
    expect(cartId).toBeNull()
    expect(renewCookie).toBe(false)
    expect(await counts()).toEqual(NOTHING)
  })

  it("E7: ignores a status or issues the client sends, and errors can't be acknowledged", async () => {
    const { items } = await setup()
    const first = await add(items(buildAx()), null)
    if (first.result.ok || first.result.reason !== "errors")
      throw new Error("setup")

    const { result } = await addBuildToCart(
      {
        items: items(buildAx()),
        status: "ok",
        issues: [],
        acknowledgedWarnings: first.result.issues.map(warningKey),
      },
      { cartId: null, today: FIXTURE_TODAY }
    )

    expect(result).toMatchObject({ ok: false, reason: "errors" })
    expect(await counts()).toEqual(NOTHING)
  })

  it("E12: a part that can't be bought now (out of stock)", async () => {
    const { items } = await setup({ [seed.rtx4060.id]: { stock: 0 } })

    const { result } = await add(items(buildA()), null)

    expect(result).toEqual({
      ok: false,
      reason: "unavailable",
      parts: [{ name: seed.rtx4060.name, why: "not-buyable" }],
    })
    expect(await counts()).toEqual(NOTHING)
  })

  it("a pre-order part can't be bought now either", async () => {
    const { items } = await setup({
      [seed.lancool216.id]: { stock: 0, preorderShipsOn: "2027-02-01" },
    })

    const { result } = await add(items(buildA()), null)

    expect(result).toMatchObject({
      ok: false,
      reason: "unavailable",
      parts: [{ name: seed.lancool216.name, why: "not-buyable" }],
    })
  })

  it("E13: a part that is no longer sold (draft)", async () => {
    const { items } = await setup({ [seed.lancool216.id]: { status: "DRAFT" } })

    const { result } = await add(items(buildA()), null)

    expect(result).toEqual({
      ok: false,
      reason: "unavailable",
      parts: [{ name: seed.lancool216.name, why: "retired" }],
    })
    expect(await counts()).toEqual(NOTHING)
  })

  it("lists every unavailable part in slot order", async () => {
    const { items } = await setup({
      [seed.lancool216.id]: { status: "DRAFT" },
      [seed.ryzen5_7600.id]: { stock: 0 },
    })

    const { result } = await add(items(buildA()), null)

    expect(result).toMatchObject({
      reason: "unavailable",
      parts: [
        { name: seed.ryzen5_7600.name, why: "not-buyable" },
        { name: seed.lancool216.name, why: "retired" },
      ],
    })
  })

  it("a product nobody has is named by its slot", async () => {
    const { items } = await setup()
    const withGhost = items(buildA()).map((item) =>
      item.slot === "cpu" ? { ...item, productId: UNKNOWN_PRODUCT_ID } : item
    )

    const { result } = await add(withGhost, null)

    expect(result).toEqual({
      ok: false,
      reason: "unavailable",
      parts: [{ name: "CPU", why: "retired" }],
    })
  })

  it("E21: bad input writes nothing", async () => {
    const { items } = await setup()
    const a = items(buildA())
    const cases: [unknown, string][] = [
      [undefined, "invalid"],
      ["x", "invalid"],
      [{ items: "not a list" }, "invalid"],
      [{ items: [] }, "empty"],
      [
        {
          items: Array.from({ length: 21 }, (_, i) => ({
            ...a[0],
            productId: `p${i}`,
          })),
        },
        "too-many-parts",
      ],
      [
        { items: [...a, { slot: "cpu", productId: "other", quantity: 1 }] },
        "invalid",
      ],
      [
        {
          items: a.map((item) =>
            item.slot === "memory" ? { ...item, quantity: 100 } : item
          ),
        },
        "quantity-too-high",
      ],
      [{ items: a, acknowledgedWarnings: "all" }, "invalid"],
      [{ items: a, acknowledgedWarnings: Array(51).fill("k") }, "invalid"],
      [{ items: a, acknowledgedWarnings: ["x".repeat(201)] }, "invalid"],
    ]
    for (const [input, reason] of cases) {
      const outcome = await addBuildToCart(input, {
        cartId: null,
        today: FIXTURE_TODAY,
      })
      expect(
        outcome.result,
        String(JSON.stringify(input)).slice(0, 60)
      ).toMatchObject({
        ok: false,
        reason,
      })
      expect(outcome.renewCookie).toBe(false)
    }
    expect(await counts()).toEqual(NOTHING)
  })
})

describe("warnings", () => {
  it("E8: a warning that wasn't acknowledged comes back, and nothing is written", async () => {
    const { items } = await setup()

    const { result } = await add(items(buildB()), null)

    expect(result).toMatchObject({ ok: false, reason: "confirm" })
    if (result.ok || result.reason !== "confirm") throw new Error("shape")
    expect(result.warnings.map((warning) => warning.rule)).toEqual([
      "bios-update",
    ])
    expect(await counts()).toEqual(NOTHING)
  })

  it("E9: acknowledging its key adds the build", async () => {
    const { items, id } = await setup()
    const key = `bios-update:cpu/${id(seed.i5_14400f)},motherboard/${id(seed.proB760mDdr4)}`

    const { result } = await add(items(buildB()), null, [key])

    expect(result).toEqual({ ok: true, status: "added", count: 1 })
    expect(await db.cartItem.count()).toBe(8)
  })

  it("E10: a key it doesn't have doesn't count", async () => {
    const { items, id } = await setup()

    const { result } = await add(items(buildB()), null, [
      `integrated-graphics:cpu/${id(seed.i5_14400f)}`,
    ])

    expect(result).toMatchObject({ ok: false, reason: "confirm" })
  })

  it("E10b: one of two acknowledged → both come back", async () => {
    const { items, id } = await setup()
    const bios = `bios-update:cpu/${id(seed.i5_14400f)},motherboard/${id(seed.proB760mDdr4)}`

    const { result } = await add(items(buildBPrime()), null, [bios])

    expect(result).toMatchObject({ ok: false, reason: "confirm" })
    if (result.ok || result.reason !== "confirm") throw new Error("shape")
    expect(result.warnings.map((warning) => warning.rule)).toEqual([
      "psu-wattage",
      "bios-update",
    ])
  })

  it("E11: data that changed after the client loaded asks again", async () => {
    const { items, id } = await setup()
    const psu = await db.product.findUniqueOrThrow({
      where: { id: id(seed.mwe550) },
      select: { specs: true },
    })
    await db.product.update({
      where: { id: id(seed.mwe550) },
      data: { specs: { ...(psu.specs as object), wattageW: 300 } },
    })

    const { result } = await add(items(buildA()), null)

    expect(result).toMatchObject({ ok: false, reason: "confirm" })
    if (result.ok || result.reason !== "confirm") throw new Error("shape")
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].message).toContain(
      "need an estimated 264 W, 88% of the 300 W"
    )
    expect(await counts()).toEqual(NOTHING)
  })

  it("a client that confirms what the server named is added", async () => {
    const { items } = await setup()

    const { result } = await addConfirmed(items(buildBPrime()), null)

    expect(result).toEqual({ ok: true, status: "added", count: 1 })
  })
})

describe("stock across all cart lines (all or nothing)", () => {
  const single = (cartId: string | null, productId: string, quantity = 1) =>
    addToCart({ productId, quantity }, { cartId, today: FIXTURE_TODAY })

  it("E14: one in stock and one already in the cart is refused", async () => {
    const { items, id } = await setup({ [seed.ryzen5_7600.id]: { stock: 1 } })
    const cart = (await single(null, id(seed.ryzen5_7600))).cartId

    const { result } = await add(items(buildA()), cart)

    expect(result).toEqual({
      ok: false,
      reason: "stock",
      shortages: [
        {
          productId: id(seed.ryzen5_7600),
          name: seed.ryzen5_7600.name,
          stock: 1,
          inCart: 1,
          needs: 1,
          limit: "stock",
        },
      ],
    })
    expect(await db.build.count()).toBe(0)
    expect(await db.cartItem.count()).toBe(1)
  })

  it("E15: another build with the same SSD is added while stock lasts (2 of 3)", async () => {
    const { items, id } = await setup({ [seed.pro990.id]: { stock: 3 } })
    const first = await add(items(buildA()), null)

    const { result } = await addConfirmed(items(buildAx3d()), first.cartId)

    expect(result).toEqual({ ok: true, status: "added", count: 2 })
    expect(
      (
        await db.cartItem.aggregate({
          where: { productId: id(seed.pro990) },
          _sum: { quantity: true },
        })
      )._sum.quantity
    ).toBe(2)
  })

  it("E16: a kit of 2 fits exactly 2 in stock", async () => {
    const { items } = await setup({ [seed.vengeanceDdr5.id]: { stock: 2 } })

    const { result } = await add(items(buildAKit2()), null)

    expect(result).toMatchObject({ ok: true, status: "added" })
  })

  it("E17: the kit × 2 with one already in the cart is refused", async () => {
    const { items, id } = await setup({ [seed.vengeanceDdr5.id]: { stock: 2 } })
    const cart = (await single(null, id(seed.vengeanceDdr5))).cartId

    const { result } = await add(items(buildAKit2()), cart)

    expect(result).toMatchObject({
      reason: "stock",
      shortages: [{ stock: 2, inCart: 1, needs: 2, limit: "stock" }],
    })
  })

  it("E18: the build alone needs more than the stock", async () => {
    const { items } = await setup({ [seed.vengeanceDdr5.id]: { stock: 1 } })

    const { result } = await add(items(buildAKit2()), null)

    expect(result).toMatchObject({
      reason: "stock",
      shortages: [{ stock: 1, inCart: 0, needs: 2 }],
    })
    expect(await counts()).toEqual(NOTHING)
  })

  it("E19: every short product, in slot order", async () => {
    const { items, id } = await setup({
      [seed.ryzen5_7600.id]: { stock: 1 },
      [seed.pro990.id]: { stock: 1 },
    })
    const cart = (await single(null, id(seed.pro990))).cartId
    await single(cart, id(seed.ryzen5_7600))

    const { result } = await add(items(buildA()), cart)

    expect(result).toMatchObject({ reason: "stock" })
    if (result.ok || result.reason !== "stock") throw new Error("shape")
    expect(result.shortages.map((short) => short.name)).toEqual([
      seed.ryzen5_7600.name,
      seed.pro990.name,
    ])
  })

  it("E20: 99 in the cart is the limit when stock is above it", async () => {
    const { items, id } = await setup({ [seed.ryzen5_7600.id]: { stock: 500 } })
    const cart = (await single(null, id(seed.ryzen5_7600), 99)).cartId

    const { result } = await add(items(buildA()), cart)

    expect(result).toMatchObject({
      reason: "stock",
      shortages: [{ stock: 500, inCart: 99, limit: "max" }],
    })
  })

  it("E27: a single add counts the group's units against the stock", async () => {
    const { items, id } = await setup({ [seed.ryzen5_7600.id]: { stock: 12 } })
    const first = await add(items(buildA()), null)

    const added = await single(first.cartId, id(seed.ryzen5_7600), 11)

    expect(added.result).toMatchObject({ ok: true, added: 11 })
    expect(added.result).not.toHaveProperty("note")
    const more = await single(first.cartId, id(seed.ryzen5_7600), 1)
    expect(more.result).toMatchObject({ ok: true, added: 0 })
  })
})

describe("concurrency", () => {
  it("E24: two adds of the same build at once give one group", async () => {
    const { items } = await setup()
    const cart = await emptyCart()

    const [a, b] = await Promise.all([
      add(items(buildA()), cart),
      add(items(buildA()), cart),
    ])

    expect([a.result, b.result].map((r) => r.ok && r.status).sort()).toEqual([
      "added",
      "already-in-cart",
    ])
    expect(await db.cartItem.count({ where: { cartId: cart } })).toBe(8)
    expect(await db.build.count()).toBe(1)
  })

  it("E25: two builds competing for the last unit don't both get in", async () => {
    const { items } = await setup({ [seed.pro990.id]: { stock: 1 } })
    const cart = await emptyCart()
    const [a, b] = await Promise.all([
      add(items(buildA()), cart),
      addConfirmed(items(buildAx3d()), cart),
    ])

    const outcomes = [a.result, b.result]
    expect(outcomes.filter((r) => r.ok)).toHaveLength(1)
    expect(outcomes.filter((r) => !r.ok && r.reason === "stock")).toHaveLength(
      1
    )
    expect(await db.cartItem.count({ where: { cartId: cart } })).toBe(8)
  })

  it("E26: two carts adding the same new contents at once share one Build", async () => {
    const { items } = await setup()
    const [one, two] = [await emptyCart(), await emptyCart()]

    const [a, b] = await Promise.all([
      add(items(buildA()), one),
      add(items(buildA()), two),
    ])

    expect(a.result).toMatchObject({ ok: true, status: "added" })
    expect(b.result).toMatchObject({ ok: true, status: "added" })
    expect(await db.build.count()).toBe(1)
    expect(await db.buildItem.count()).toBe(8)
    expect(await db.cartItem.count()).toBe(16)
  })

  it("a failure after the cart is made rolls everything back", async () => {
    const { items } = await setup()
    // A build that already owns the only slug the test will offer
    await db.build.create({
      data: { shareSlug: "aaaaaaaaaa", contentHash: "h".repeat(64) },
    })
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})

    const { result, cartId, renewCookie } = await addBuildToCart(
      { items: items(buildA()), acknowledgedWarnings: [] },
      { cartId: null, today: FIXTURE_TODAY, newSlug: () => "aaaaaaaaaa" }
    )
    errors.mockRestore()

    expect(result).toEqual({ ok: false, reason: "error" })
    expect(cartId).toBeNull()
    expect(renewCookie).toBe(false)
    // The cart that was inserted before the snapshot failed is gone too
    expect(await counts()).toEqual({ ...NOTHING, builds: 1 })
  })
})

describe("removing a group", () => {
  it("E28: deletes the group's lines only and keeps the snapshot", async () => {
    const { items, id } = await setup()
    const first = await add(items(buildA()), null)
    await addToCart(
      { productId: id(seed.ryzen5_7600), quantity: 2 },
      { cartId: first.cartId, today: FIXTURE_TODAY }
    )
    const build = await db.build.findFirstOrThrow()

    const { result, renewCookie } = await removeBuildFromCart(
      { buildId: build.id },
      { cartId: first.cartId }
    )

    expect(result).toEqual({ ok: true, count: 2, line: null })
    expect(renewCookie).toBe(true)
    expect(await db.cartItem.count()).toBe(1)
    expect(await db.build.count()).toBe(1)
    expect(await db.buildItem.count()).toBe(8)
  })

  it("E29: another cart's group, or no cookie, is not found", async () => {
    const { items } = await setup()
    const first = await add(items(buildA()), null)
    const build = await db.build.findFirstOrThrow()

    for (const cartId of [await emptyCart(), null, newCartId()]) {
      const { result, renewCookie } = await removeBuildFromCart(
        { buildId: build.id },
        { cartId }
      )
      expect(result).toEqual({ ok: false, reason: "not-found" })
      expect(renewCookie).toBe(false)
    }
    expect(await db.cartItem.count({ where: { cartId: first.cartId! } })).toBe(
      8
    )
  })

  it("bad input is invalid", async () => {
    const outcome = await removeBuildFromCart({ buildId: "" }, { cartId: null })
    expect(outcome.result).toEqual({ ok: false, reason: "invalid" })
  })

  it("E30: a group's line can't be changed or removed one by one", async () => {
    const { items } = await setup()
    const first = await add(items(buildA()), null)
    const line = await db.cartItem.findFirstOrThrow()

    const set = await setCartQuantity(
      { lineId: line.id, quantity: 2 },
      { cartId: first.cartId, today: FIXTURE_TODAY }
    )
    const remove = await removeFromCart(
      { lineId: line.id },
      { cartId: first.cartId }
    )

    expect(set.result).toEqual({ ok: false, reason: "not-found" })
    expect(remove.result).toEqual({ ok: false, reason: "not-found" })
    expect(await db.cartItem.count()).toBe(8)
  })

  it("E31: removing twice is ok, then not found", async () => {
    const { items } = await setup()
    const first = await add(items(buildA()), null)
    const { id } = await db.build.findFirstOrThrow()

    const one = await removeBuildFromCart(
      { buildId: id },
      { cartId: first.cartId }
    )
    const two = await removeBuildFromCart(
      { buildId: id },
      { cartId: first.cartId }
    )

    expect(one.result).toMatchObject({ ok: true })
    expect(two.result).toEqual({ ok: false, reason: "not-found" })
  })

  it("the same build can be added again afterwards", async () => {
    const { items } = await setup()
    const first = await add(items(buildA()), null)
    const { id } = await db.build.findFirstOrThrow()
    await removeBuildFromCart({ buildId: id }, { cartId: first.cartId })

    const again = await add(items(buildA()), first.cartId)

    expect(again.result).toMatchObject({ ok: true, status: "added" })
    expect(await db.build.count()).toBe(1)
  })
})

describe("the cart with groups", () => {
  const groups = async (cart: string | null) =>
    (await getCartView(cart, FIXTURE_TODAY)).entries.filter(
      (entry) => entry.kind === "build"
    )

  it("E32: a group is one entry with its parts, total and status", async () => {
    const { items } = await setup()
    const { cartId } = await add(items(buildA()), null)

    const view = await getCartView(cartId, FIXTURE_TODAY)

    expect(view.entries).toHaveLength(1)
    const [group] = await groups(cartId)
    expect(group).toMatchObject({
      kind: "build",
      number: null,
      partCount: 8,
      total: 8 * 100_000,
      status: "ok",
      issues: [],
    })
    expect(group.slots.map((slot) => slot.slot)).toEqual([
      "cpu",
      "motherboard",
      "memory",
      "storage",
      "gpu",
      "case",
      "psu",
      "cpu-cooler",
    ])
    expect((await db.build.findFirstOrThrow()).shareSlug).toBe(
      group.kind === "build" && group.slug
    )
    expect(view.subtotal).toBe(8 * 100_000)
    expect(view.count).toBe(1)
  })

  it("E33: a kit × 2 counts twice in the total and once as a part", async () => {
    const { items } = await setup()
    const { cartId } = await add(items(buildAKit2()), null)

    const [group] = await groups(cartId)

    expect(group).toMatchObject({ partCount: 8, total: 9 * 100_000 })
    const memory = group.kind === "build" && group.slots[2].rows[0]
    expect(memory).toMatchObject({ kind: "part", quantity: 2 })
  })

  it("E34: a group with a warning reads Warnings", async () => {
    const { items } = await setup()
    const { cartId } = await addConfirmed(items(buildB()), null)

    const [group] = await groups(cartId)

    expect(group).toMatchObject({ status: "warnings" })
    expect(group.kind === "build" && group.issues.map((i) => i.rule)).toEqual([
      "bios-update",
    ])
  })

  it("E35: groups and single lines are in the order they were added", async () => {
    const { items, id } = await setup()
    const first = await add(items(buildA()), null)
    await addToCart(
      { productId: id(seed.ryzen5_7600), quantity: 2 },
      { cartId: first.cartId, today: FIXTURE_TODAY }
    )

    const view = await getCartView(first.cartId, FIXTURE_TODAY)

    expect(view.entries.map((entry) => entry.kind)).toEqual(["build", "single"])
    expect(view.subtotal).toBe(8 * 100_000 + 2 * 100_000)
    expect(view.count).toBe(3)
  })

  it("E36: two groups are numbered in cart order", async () => {
    const { items } = await setup()
    const first = await add(items(buildA()), null)
    await addConfirmed(items(buildB()), first.cartId)

    const entries = await groups(first.cartId)

    expect(
      entries.map((group) => group.kind === "build" && group.number)
    ).toEqual([1, 2])
  })

  it("E37: a part that is no longer sold makes the group incomplete", async () => {
    const { items, id } = await setup()
    const { cartId } = await add(items(buildA()), null)
    await db.product.update({
      where: { id: id(seed.lancool216) },
      data: { status: "DRAFT" },
    })

    const [group] = await groups(cartId)

    expect(group).toMatchObject({
      status: "incomplete",
      partCount: 8,
      total: 7 * 100_000,
    })
    expect(
      group.kind === "build" && group.slots.flatMap((slot) => slot.rows)
    ).toContainEqual(
      expect.objectContaining({ kind: "retired", name: seed.lancool216.name })
    )
    expect((await getCartView(cartId, FIXTURE_TODAY)).count).toBe(1)
  })

  it("E38: a part that is out of stock stays in the total", async () => {
    const { items, id } = await setup()
    const { cartId } = await add(items(buildA()), null)
    await db.product.update({
      where: { id: id(seed.rtx4060) },
      data: { stock: 0 },
    })

    const [group] = await groups(cartId)

    expect(group).toMatchObject({ status: "ok", total: 8 * 100_000 })
    const gpu = group.kind === "build" && group.slots[4].rows[0]
    expect(gpu).toMatchObject({
      kind: "part",
      data: { stockStatus: "out-of-stock" },
    })
  })

  it("E39: prices are read fresh, never stored in the cart", async () => {
    const { items, id } = await setup()
    const { cartId } = await add(items(buildA()), null)
    await db.product.update({
      where: { id: id(seed.ryzen5_7600) },
      data: { price: 1_000_000 },
    })

    const [group] = await groups(cartId)

    expect(group).toMatchObject({ total: 7 * 100_000 + 1_000_000 })
  })

  it("a group whose parts later conflict shows Errors (checkout blocks it)", async () => {
    const { items, id } = await setup()
    const { cartId } = await add(items(buildA()), null)
    const gpu = await db.product.findUniqueOrThrow({
      where: { id: id(seed.rtx4060) },
      select: { specs: true },
    })
    await db.product.update({
      where: { id: id(seed.rtx4060) },
      data: { specs: { ...(gpu.specs as object), lengthMm: 999 } },
    })

    const [group] = await groups(cartId)

    expect(group).toMatchObject({ status: "errors" })
    expect(group.kind === "build" && group.issues[0].rule).toBe("gpu-length")
  })

  it("a cart with only a group isn't empty", async () => {
    const { items } = await setup()
    const { cartId } = await add(items(buildA()), null)

    expect(singleLines(await getCartView(cartId, FIXTURE_TODAY))).toEqual([])
    expect((await getCartView(cartId, FIXTURE_TODAY)).entries).toHaveLength(1)
  })
})

describe("the header count with groups (E56–E60)", () => {
  it("counts a group as 1, however many units it holds", async () => {
    const { items } = await setup()

    const a = await add(items(buildA()), null)
    expect(await getCartCount(a.cartId)).toBe(1)

    const kit = await add(items(buildAKit2()), null)
    expect(await getCartCount(kit.cartId)).toBe(1)
  })

  it("adds a group to single units, and removing the group takes 1 off", async () => {
    const { items, id } = await setup()
    const first = await add(items(buildA()), null)
    await addToCart(
      { productId: id(seed.ryzen5_7600), quantity: 2 },
      { cartId: first.cartId, today: FIXTURE_TODAY }
    )
    expect(await getCartCount(first.cartId)).toBe(3)

    await removeBuildFromCart(
      { buildId: (await db.build.findFirstOrThrow()).id },
      { cartId: first.cartId }
    )
    expect(await getCartCount(first.cartId)).toBe(2)
  })

  it("two groups and a single unit count 3", async () => {
    const { items, id } = await setup()
    const first = await add(items(buildA()), null)
    await addConfirmed(items(buildB()), first.cartId)
    await addToCart(
      { productId: id(seed.ryzen5_7600), quantity: 1 },
      { cartId: first.cartId, today: FIXTURE_TODAY }
    )

    expect(await getCartCount(first.cartId)).toBe(3)
    expect((await getCartView(first.cartId, FIXTURE_TODAY)).count).toBe(3)
  })
})
