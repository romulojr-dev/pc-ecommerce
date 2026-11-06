import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { newCartId } from "@/lib/cart/id"
import { reviewCheckout } from "@/lib/checkout/review-checkout"
import { placeOrder, type PlaceStep } from "@/lib/orders/place-order"
import { undoReservations } from "@/lib/orders/undo-reservations"
import { shippingSeed } from "@/prisma/seed/data/shipping"
import { writeSeed } from "@/prisma/seed/write"
import { makeStaffUser } from "@/test-support/admin-session"
import { insertParts } from "@/test-support/build-fixtures"
import { db, resetCatalog } from "@/test-support/db"
import { heldOrder } from "@/test-support/release"
import { seed } from "@/test-support/seed-parts"

import type { AdjustStockInput } from "../inventory-input"
import { type AdjustStep, adjustStock } from "./adjust"

// docs/specs/046-admin-inventory-adjustments, R1, R8, R16: an adjustment run
// against a real placeOrder (E17, E18), against two staff at once (E19),
// against the stock given back by a release or a cancel (E20), and the ceiling
// and zero held by the statement itself (E41, E42). The interleavings are
// FORCED, not hoped for: one side is held open inside its transaction (placeOrder
// has an afterStep seam, adjustStock has the same), the other is started and
// seen to wait on the product row's lock, then the first is let go. In every
// case stock ends equal to its start plus the sum of the movements.

const revalidateTag = vi.hoisted(() => vi.fn())
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidateTag,
}))

let actor: { id: string; name: string; role: "staff" }
let productId: string

beforeEach(async () => {
  revalidateTag.mockReset()
  await resetCatalog()
  await writeSeed(db, [], { reset: false, shipping: shippingSeed })
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
  const user = await makeStaffUser("staff@example.com", "STAFF")
  actor = { id: user.id, name: user.name, role: "staff" }
  productId = (await insertParts([seed.ryzen5_7600])).get(seed.ryzen5_7600.id)!
})
afterAll(() => db.$disconnect())

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// A held step: `reached` says the holder is inside its transaction past the
// stock update, `release` lets it finish
function hold() {
  let release!: () => void
  let reachedNow!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))
  const reached = new Promise<void>((resolve) => (reachedNow = resolve))
  return { reached, reachedNow, released, release }
}

// Is this promise still waiting after a moment?
async function stillWaiting(promise: Promise<unknown>): Promise<boolean> {
  let done = false
  void promise.then(
    () => (done = true),
    () => (done = true)
  )
  await sleep(400)
  return !done
}

const setStock = (stock: number) =>
  db.product.update({ where: { id: productId }, data: { stock } })
const stockNow = async () =>
  (await db.product.findUniqueOrThrow({ where: { id: productId } })).stock
const movementTotal = async () =>
  (await db.stockMovement.findMany({ where: { productId } })).reduce(
    (sum, m) => sum + m.change,
    0
  )

const adjustInput = (
  over: Partial<AdjustStockInput> = {}
): AdjustStockInput => ({
  productId,
  reason: "RECEIVED",
  delta: 5,
  note: "",
  shownStock: 0,
  ...over,
})
const adjust = (
  over: Partial<AdjustStockInput> = {},
  afterStep?: (step: AdjustStep) => void | Promise<void>
) => adjustStock(actor, adjustInput(over), { afterStep })

// An adjustment held right after its stock update
function heldAdjust(over: Partial<AdjustStockInput>) {
  const gate = hold()
  const result = adjust(over, async (step) => {
    if (step !== "stock") return
    gate.reachedNow()
    await gate.released
  })
  return { ...gate, result }
}

// ---- A real placeOrder ----

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

async function orderRequest(quantity: number) {
  const cartId = newCartId()
  await db.cart.create({ data: { id: cartId } })
  await db.cartItem.create({ data: { cartId, productId, quantity } })
  const details = { method: "delivery", contact, address: QC }
  const review = await reviewCheckout(cartId, details)
  if (!review.ok) throw new Error(`review failed: ${review.reason}`)
  return {
    cartId,
    request: {
      details,
      digest: review.digest,
      idempotencyKey: review.idempotencyKey,
      accessToken: review.accessToken,
    },
  }
}

// An order held right after it took the stock
async function heldOrderPlacement(quantity: number) {
  const { cartId, request } = await orderRequest(quantity)
  const gate = hold()
  const result = placeOrder(cartId, request, {
    afterStep: async (step: PlaceStep) => {
      if (step !== "stock") return
      gate.reachedNow()
      await gate.released
    },
  })
  return { ...gate, result }
}

describe("E17: against a concurrent placeOrder", () => {
  it("the order takes the last units first: the adjustment waits, then is refused on the real stock", async () => {
    await setStock(5)
    const order = await heldOrderPlacement(5)
    await order.reached

    const waiting = adjust({ reason: "DAMAGED", delta: -3 })
    expect(await stillWaiting(waiting)).toBe(true)
    order.release()

    expect(await order.result).toMatchObject({ ok: true })
    expect(await waiting).toEqual({
      kind: "refused",
      refusal: { kind: "too-low", stock: 0 },
    })
    expect(await stockNow()).toBe(0)
    expect(await movementTotal()).toBe(-5)
  })

  it("the adjustment commits first: the order waits, then is refused as changed", async () => {
    await setStock(5)
    const { cartId, request } = await orderRequest(5)
    const adjusting = heldAdjust({ reason: "DAMAGED", delta: -3 })
    await adjusting.reached

    const placing = placeOrder(cartId, request)
    expect(await stillWaiting(placing)).toBe(true)
    adjusting.release()

    expect(await adjusting.result).toMatchObject({
      kind: "adjusted",
      stock: 2,
    })
    expect(await placing).toEqual({ ok: false, reason: "changed" })
    expect(await stockNow()).toBe(2)
    expect(await db.order.count()).toBe(0)
    expect(await movementTotal()).toBe(-3)
  })
})

describe("E18: a received delivery never overwrites an order's decrement", () => {
  it("order first, then Received", async () => {
    await setStock(5)
    const order = await heldOrderPlacement(2)
    await order.reached
    const waiting = adjust({ delta: 10 })
    expect(await stillWaiting(waiting)).toBe(true)
    order.release()
    expect(await order.result).toMatchObject({ ok: true })
    expect(await waiting).toMatchObject({ kind: "adjusted", stock: 13 })
    expect(await stockNow()).toBe(13)
    expect(5 + (await movementTotal())).toBe(13)
  })

  it("Received first, then the order", async () => {
    await setStock(5)
    const { cartId, request } = await orderRequest(2)
    const adjusting = heldAdjust({ delta: 10 })
    await adjusting.reached
    const placing = placeOrder(cartId, request)
    expect(await stillWaiting(placing)).toBe(true)
    adjusting.release()
    expect(await adjusting.result).toMatchObject({
      kind: "adjusted",
      stock: 15,
    })
    expect(await placing).toMatchObject({ ok: true })
    expect(await stockNow()).toBe(13)
    expect(5 + (await movementTotal())).toBe(13)
  })
})

describe("E19: two staff at once", () => {
  it("both Received apply: a delta cannot lose an update", async () => {
    await setStock(10)
    const results = await Promise.all([
      adjust({ delta: 5 }),
      adjust({ delta: 5 }),
    ])
    expect(results.every((r) => r.kind === "adjusted")).toBe(true)
    expect(await stockNow()).toBe(20)
    expect(await db.stockMovement.count({ where: { productId } })).toBe(2)
  })
})

describe("E20: against the stock given back by a release or a cancel", () => {
  // undoReservations is the one statement the release and Admin's cancel share
  async function giveBack(orderId: string, gate?: ReturnType<typeof hold>) {
    await db.$transaction(async (tx) => {
      await undoReservations(tx, [orderId], { actorId: actor.id })
      if (gate) {
        gate.reachedNow()
        await gate.released
      }
    })
  }

  it("the give-back first: the adjustment waits and applies on top", async () => {
    await setStock(10)
    const order = await heldOrder([{ productId, quantity: 4 }])
    expect(await stockNow()).toBe(6)
    const gate = hold()
    const giving = giveBack(order.id, gate)
    await gate.reached

    // -5 passes on the committed stock (6), so it waits for the row lock and
    // is checked again on the stock the give-back leaves (10)
    const waiting = adjust({ reason: "DAMAGED", delta: -5 })
    expect(await stillWaiting(waiting)).toBe(true)
    gate.release()
    await giving

    expect(await waiting).toMatchObject({ kind: "adjusted", stock: 5 })
    expect(await stockNow()).toBe(5)
  })

  it("the adjustment first: the give-back waits and applies on top", async () => {
    await setStock(10)
    const order = await heldOrder([{ productId, quantity: 4 }])
    const adjusting = heldAdjust({ delta: 1 })
    await adjusting.reached

    const giving = giveBack(order.id)
    expect(await stillWaiting(giving)).toBe(true)
    adjusting.release()

    expect(await adjusting.result).toMatchObject({ kind: "adjusted", stock: 7 })
    await giving
    expect(await stockNow()).toBe(11)
    const movements = await db.stockMovement.findMany({ where: { productId } })
    expect(movements.map((m) => m.reason).sort()).toEqual(
      ["ORDER_RELEASED", "ORDER_RESERVED", "RECEIVED"].sort()
    )
  })
})

describe("E41: two adjustments cannot pass the ceiling together", () => {
  it("forced: the second waits on the first, then is refused", async () => {
    await setStock(999_000)
    const first = heldAdjust({ delta: 600 })
    await first.reached
    const second = adjust({ delta: 600 })
    expect(await stillWaiting(second)).toBe(true)
    first.release()

    expect(await first.result).toMatchObject({
      kind: "adjusted",
      stock: 999_600,
    })
    expect(await second).toEqual({
      kind: "refused",
      refusal: { kind: "too-high", stock: 999_600 },
    })
    expect(await stockNow()).toBe(999_600)
    expect(await db.stockMovement.count({ where: { productId } })).toBe(1)
  })

  it("racing freely, repeatedly: exactly one applies and stock never passes 1,000,000", async () => {
    for (let round = 0; round < 5; round++) {
      await db.stockMovement.deleteMany({ where: { productId } })
      await setStock(999_000)
      const results = await Promise.all([
        adjust({ delta: 600 }),
        adjust({ delta: 600 }),
        adjust({ delta: 600 }),
      ])
      expect(results.filter((r) => r.kind === "adjusted")).toHaveLength(1)
      expect(results.filter((r) => r.kind === "refused")).toHaveLength(2)
      expect(await stockNow()).toBe(999_600)
      expect(await movementTotal()).toBe(600)
    }
  })
})

describe("E42: two removals cannot take stock below zero together", () => {
  it("forced: the second is refused on the stock that is left", async () => {
    await setStock(5)
    const first = heldAdjust({ reason: "DAMAGED", delta: -3 })
    await first.reached
    const second = adjust({ reason: "DAMAGED", delta: -3 })
    expect(await stillWaiting(second)).toBe(true)
    first.release()

    expect(await first.result).toMatchObject({ kind: "adjusted", stock: 2 })
    expect(await second).toEqual({
      kind: "refused",
      refusal: { kind: "too-low", stock: 2 },
    })
    expect(await stockNow()).toBe(2)
  })

  it("racing freely, repeatedly: stock is never negative and equals start plus the movements", async () => {
    for (let round = 0; round < 5; round++) {
      await db.stockMovement.deleteMany({ where: { productId } })
      await setStock(5)
      const results = await Promise.all([
        adjust({ reason: "DAMAGED", delta: -3 }),
        adjust({ reason: "DAMAGED", delta: -3 }),
      ])
      expect(results.filter((r) => r.kind === "adjusted")).toHaveLength(1)
      expect(await stockNow()).toBe(2)
      expect(5 + (await movementTotal())).toBe(2)
    }
  })
})
