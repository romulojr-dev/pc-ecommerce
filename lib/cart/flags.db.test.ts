import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { warningKey } from "@/lib/build-state/warnings"
import type { BuildItem } from "@/lib/builder"
import { db, FIXTURE_TODAY, resetCatalog } from "@/test-support/db"
import {
  insertParts,
  itemsWithIds,
  partsOfBuild,
} from "@/test-support/build-fixtures"
import { buildA, buildB, seed } from "@/test-support/seed-parts"

import { addBuildToCart } from "./build"
import { getCartView, setCartQuantity } from "./cart"
import { newCartId } from "./id"
import type { CartGroupView, CartLineView } from "./types"

// Stock flags on the cart page (docs/specs/027-cart-stock-flags, E1–E8,
// E10–E16, E20). "[n]" sets the product's stock after the lines are in the
// cart, the way stock really drops under one.

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

type Overrides = NonNullable<Parameters<typeof insertParts>[1]>

async function setup(overrides: Overrides = {}) {
  const parts = new Map(
    [
      ...partsOfBuild(buildA()),
      ...partsOfBuild(buildB()),
      seed.ryzen7_9800x3d,
    ].map((part) => [part.id, part])
  )
  const ids = await insertParts([...parts.values()], overrides)
  return {
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

const single = (cartId: string, productId: string, quantity: number) =>
  db.cartItem.create({ data: { cartId, productId, quantity } })

// What a client does after a `confirm`: send the same items with the keys of
// the warnings the server named
async function addBuild(items: BuildItem[], cartId: string) {
  const options = { cartId, today: FIXTURE_TODAY }
  const first = await addBuildToCart(
    { items, acknowledgedWarnings: [] },
    options
  )
  if (first.result.ok || first.result.reason !== "confirm") {
    expect(first.result.ok).toBe(true)
    return
  }
  const second = await addBuildToCart(
    { items, acknowledgedWarnings: first.result.warnings.map(warningKey) },
    options
  )
  expect(second.result.ok).toBe(true)
}

const stockOf = (productId: string, stock: number) =>
  db.product.update({ where: { id: productId }, data: { stock } })

const view = (cartId: string) => getCartView(cartId, FIXTURE_TODAY)
const singles = (v: Awaited<ReturnType<typeof view>>) =>
  v.entries.filter((entry): entry is CartLineView => entry.kind === "single")
const groups = (v: Awaited<ReturnType<typeof view>>) =>
  v.entries.filter((entry): entry is CartGroupView => entry.kind === "build")

describe("over stock", () => {
  it("E1, E2: a single line and a group, flagged together; Set to 1 clears both", async () => {
    const { id, items } = await setup()
    const cart = await emptyCart()
    const line = await single(cart, id(seed.ryzen5_7600), 2)
    await addBuild(items(buildA()), cart)
    await stockOf(id(seed.ryzen5_7600), 2)

    const before = await view(cart)
    const [flagged] = singles(before)
    expect(flagged.flag).toEqual({ kind: "over-stock", stock: 2, total: 3 })
    expect(flagged.setTo).toBe(1)
    const [group] = groups(before)
    expect(group.flags).toEqual([
      {
        productId: id(seed.ryzen5_7600),
        name: seed.ryzen5_7600.name,
        flag: { kind: "over-stock", stock: 2, total: 3 },
      },
    ])
    expect(before.flagged).toBe(2)

    const set = await setCartQuantity(
      { lineId: line.id, quantity: flagged.setTo! },
      { cartId: cart, today: FIXTURE_TODAY }
    )
    expect(set.result.ok).toBe(true)

    const after = await view(cart)
    expect(after.flagged).toBe(0)
    expect(singles(after)[0].flag).toBeNull()
    expect(groups(after)[0].flags).toEqual([])
  })

  it("E4, E9: at or under the stock there is no flag", async () => {
    const { id, items } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.ryzen5_7600), 3)
    await addBuild(items(buildA()), cart)

    await stockOf(id(seed.ryzen5_7600), 5)
    expect((await view(cart)).flagged).toBe(0)
    await stockOf(id(seed.ryzen5_7600), 4)
    expect((await view(cart)).flagged).toBe(0)
    await stockOf(id(seed.ryzen5_7600), 3)
    expect((await view(cart)).flagged).toBe(2)
  })

  it("E5: a single line alone over the stock", async () => {
    const { id } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.ryzen5_7600), 3)
    await stockOf(id(seed.ryzen5_7600), 2)

    const [line] = singles(await view(cart))
    expect(line.flag).toEqual({ kind: "over-stock", stock: 2, total: 3 })
    expect(line.setTo).toBe(2)
  })

  it("E6: the group holds all the stock, so there is no Set to", async () => {
    const { id, items } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    await addBuild(items(buildA()), cart)
    await stockOf(id(seed.ryzen5_7600), 1)

    const v = await view(cart)
    expect(singles(v)[0].flag).toMatchObject({ kind: "over-stock" })
    expect(singles(v)[0].setTo).toBeNull()
    expect(v.flagged).toBe(2)
  })

  it("E7: two groups share a product", async () => {
    const { id, items } = await setup()
    const cart = await emptyCart()
    await addBuild(items(buildA()), cart)
    await addBuild(items(buildB()), cart)
    await stockOf(id(seed.peerless), 1)

    const v = await view(cart)
    expect(groups(v)).toHaveLength(2)
    for (const group of groups(v)) {
      expect(group.flags.map(({ name, flag }) => [name, flag.kind])).toEqual([
        [seed.peerless.name, "over-stock"],
      ])
    }
    expect(v.flagged).toBe(2)
  })

  it("E8: a memory kit × 2 counts its quantity", async () => {
    const { id, items } = await setup()
    const cart = await emptyCart()
    const line = await single(cart, id(seed.vengeanceDdr5), 2)
    await addBuild(
      items({
        ...buildA(),
        memory: [{ part: seed.vengeanceDdr5, quantity: 2 }],
      }),
      cart
    )
    await stockOf(id(seed.vengeanceDdr5), 3)

    const [flagged] = singles(await view(cart))
    expect(flagged.flag).toEqual({ kind: "over-stock", stock: 3, total: 4 })
    expect(flagged.setTo).toBe(1)

    await setCartQuantity(
      { lineId: line.id, quantity: 1 },
      { cartId: cart, today: FIXTURE_TODAY }
    )
    expect((await view(cart)).flagged).toBe(0)
  })
})

describe("unavailable", () => {
  it("E3: a group with a part out of stock; the total and status stay", async () => {
    const { id, items } = await setup()
    const cart = await emptyCart()
    await addBuild(items(buildA()), cart)
    const [clean] = groups(await view(cart))

    await stockOf(id(seed.ryzen5_7600), 0)

    const v = await view(cart)
    const [group] = groups(v)
    expect(group.flags).toEqual([
      {
        productId: id(seed.ryzen5_7600),
        name: seed.ryzen5_7600.name,
        flag: { kind: "out-of-stock" },
      },
    ])
    expect(group.total).toBe(clean.total)
    expect(group.status).toBe(clean.status)
    expect(v.flagged).toBe(1)
  })

  it("E10: a single line out of stock can't be raised", async () => {
    const { id } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.ryzen5_7600), 2)
    await stockOf(id(seed.ryzen5_7600), 0)

    const [line] = singles(await view(cart))
    expect(line.flag).toEqual({ kind: "out-of-stock" })
    expect(line.setTo).toBeNull()
    expect(line.max).toBe(2)
  })

  it("E11: a pre-order can't be raised even with stock", async () => {
    const { id } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.ryzen5_7600), 2)
    await db.product.update({
      where: { id: id(seed.ryzen5_7600) },
      data: { preorderShipsOn: new Date("2027-02-01") },
    })

    const [line] = singles(await view(cart))
    expect(line.flag).toEqual({ kind: "pre-order" })
    expect(line.max).toBe(2)
    expect(line.preorderShipsOn).toBe("2027-02-01")
  })

  it("E12: a retired product is no longer sold", async () => {
    const { id } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.ryzen5_7600), 2)
    await db.product.update({
      where: { id: id(seed.ryzen5_7600) },
      data: { status: "DRAFT" },
    })

    const v = await view(cart)
    expect(singles(v)[0].flag).toEqual({ kind: "retired" })
    expect(singles(v)[0].sold).toBe(false)
    expect(v.flagged).toBe(1)
  })

  it("E13: out of stock beats over stock, in both lines", async () => {
    const { id, items } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.ryzen5_7600), 1)
    await addBuild(items(buildA()), cart)
    await stockOf(id(seed.ryzen5_7600), 0)

    const v = await view(cart)
    expect(singles(v)[0].flag).toEqual({ kind: "out-of-stock" })
    expect(groups(v)[0].flags[0].flag).toEqual({ kind: "out-of-stock" })
  })

  it("E14: two parts out of stock, one flagged line", async () => {
    const { id, items } = await setup()
    const cart = await emptyCart()
    await addBuild(items(buildA()), cart)
    await stockOf(id(seed.rtx4060), 0)
    await stockOf(id(seed.ryzen5_7600), 0)

    const v = await view(cart)
    expect(groups(v)[0].flags.map(({ name }) => name)).toEqual([
      seed.ryzen5_7600.name,
      seed.rtx4060.name,
    ])
    expect(v.flagged).toBe(1)
  })

  it("E15: a retired part of a group; the status is Incomplete", async () => {
    const { id, items } = await setup()
    const cart = await emptyCart()
    await addBuild(items(buildA()), cart)
    await db.product.update({
      where: { id: id(seed.lancool216) },
      data: { status: "DRAFT" },
    })

    const [group] = groups(await view(cart))
    expect(group.flags).toEqual([
      {
        productId: id(seed.lancool216),
        name: seed.lancool216.name,
        flag: { kind: "retired" },
      },
    ])
    expect(group.status).toBe("incomplete")
  })

  it("E16: an unavailable part and an over-stock part in one group", async () => {
    const { id, items } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.pro990), 1)
    await addBuild(items(buildA()), cart)
    await stockOf(id(seed.rtx4060), 0)
    await stockOf(id(seed.pro990), 1)

    const v = await view(cart)
    const kinds = Object.fromEntries(
      groups(v)[0].flags.map(({ name, flag }) => [name, flag.kind])
    )
    expect(kinds).toEqual({
      [seed.pro990.name]: "over-stock",
      [seed.rtx4060.name]: "out-of-stock",
    })
    expect(singles(v)[0].flag).toMatchObject({ kind: "over-stock" })
    expect(singles(v)[0].setTo).toBeNull()
    expect(v.flagged).toBe(2)
  })

  it("E20: three reasons in one group are one flagged line", async () => {
    const { id, items } = await setup()
    const cart = await emptyCart()
    await addBuild(items(buildA()), cart)
    await db.product.update({
      where: { id: id(seed.ryzen5_7600) },
      data: { status: "DRAFT" },
    })
    await stockOf(id(seed.rtx4060), 0)
    await db.product.update({
      where: { id: id(seed.peerless) },
      data: { preorderShipsOn: new Date("2027-02-01") },
    })

    const v = await view(cart)
    expect(
      groups(v)[0]
        .flags.map(({ flag }) => flag.kind)
        .sort()
    ).toEqual(["out-of-stock", "pre-order", "retired"])
    expect(v.flagged).toBe(1)
  })
})

describe("a clean cart and reads", () => {
  it("E18: no flags, and the empty view says so", async () => {
    const { id, items } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.ryzen7_9800x3d), 1)
    await addBuild(items(buildA()), cart)

    const v = await view(cart)
    expect(v.flagged).toBe(0)
    expect(singles(v)[0]).toMatchObject({ flag: null, setTo: null })
    expect(groups(v)[0].flags).toEqual([])
  })

  it("reading writes nothing", async () => {
    const { id } = await setup()
    const cart = await emptyCart()
    await single(cart, id(seed.ryzen5_7600), 3)
    await stockOf(id(seed.ryzen5_7600), 2)
    const before = await db.cart.findUnique({ where: { id: cart } })

    await view(cart)

    expect(await db.cart.findUnique({ where: { id: cart } })).toEqual(before)
    expect(await db.cartItem.count()).toBe(1)
    expect((await db.cartItem.findFirst())?.quantity).toBe(3)
  })
})
