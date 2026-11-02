import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { warningKey } from "@/lib/build-state/warnings"
import { addBuildToCart } from "@/lib/cart/build"
import { addToCart, setCartQuantity } from "@/lib/cart/cart"
import { newCartId } from "@/lib/cart/id"
import { reviewCheckout } from "@/lib/checkout/review-checkout"
import { fakeGateway } from "@/lib/payments/fake"
import type { PaymentGateway } from "@/lib/payments/gateway-types"
import { shippingSeed } from "@/prisma/seed/data/shipping"
import { writeSeed } from "@/prisma/seed/write"
import {
  insertParts,
  itemsWithIds,
  partsOfBuild,
} from "@/test-support/build-fixtures"
import { db, FIXTURE_TODAY, resetCatalog } from "@/test-support/db"
import {
  EXPIRES,
  guardTransactions,
  heldOrder,
  openSession,
  PLACED,
  releaseTokenHash,
  stockOf,
} from "@/test-support/release"
import { buildA, seed } from "@/test-support/seed-parts"

import { placeOrder } from "./place-order"
import { sweepExpiredOrders } from "./release"

// docs/specs/033-release-unpaid-orders: S1–S9c, the release inside the
// purchases it protects. P1 holds 2 Ryzen 5 7600s and is due at NOW.

const revalidateTag = vi.hoisted(() => vi.fn())
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidateTag,
}))

let info: { mock: { calls: unknown[][] } }
beforeEach(async () => {
  revalidateTag.mockReset()
  await resetCatalog()
  await writeSeed(db, [], { reset: false, shipping: shippingSeed })
  info = vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const NOW = EXPIRES
// Xendit lagging: the session still reads active, so the cancel succeeds
const lagging = () => fakeGateway({ now: () => PLACED })

const logLines = () =>
  info.mock.calls
    .map(([line]) => String(line))
    .filter((line) => line.includes('"order.release"'))
    .map((line) => JSON.parse(line))

// Build A's parts, the Ryzen at `ryzenStock` before P1 takes 2
async function setup(ryzenStock = 2) {
  const ids = await insertParts(partsOfBuild(buildA()), {
    [seed.ryzen5_7600.id]: { stock: ryzenStock },
  })
  const ryzen = ids.get(seed.ryzen5_7600.id)!
  const p1 = await heldOrder([{ productId: ryzen, quantity: 2 }], {
    accessTokenHash: releaseTokenHash(),
  })
  const session = await openSession(p1.id)
  return { ids, ryzen, p1, session }
}

const options = (gateway: PaymentGateway = lagging(), now = NOW) => ({
  cartId: null,
  today: FIXTURE_TODAY,
  now,
  gateway,
})

const orderOf = (id: string) => db.order.findUniqueOrThrow({ where: { id } })
const fakeStatus = async (id: string) =>
  (await db.fakeGatewaySession.findUniqueOrThrow({ where: { id } })).status

describe("add to cart", () => {
  it("frees the stock it needs (S1)", async () => {
    const { ryzen, p1 } = await setup()
    expect(await stockOf(ryzen)).toBe(0)

    const { result } = await addToCart(
      { productId: ryzen, quantity: 1 },
      options()
    )
    expect(result).toMatchObject({ ok: true, added: 1 })
    expect(await orderOf(p1.id)).toMatchObject({ status: "CANCELLED" })
    expect(await stockOf(ryzen)).toBe(2)
    expect(revalidateTag).toHaveBeenCalledWith("products", "max")
    expect(logLines()).toEqual([
      expect.objectContaining({ outcome: "released", via: "purchase" }),
    ])
  })

  it("releases nothing before the deadline, with no gateway call (S1a)", async () => {
    const { ryzen, p1 } = await setup()
    const gateway = lagging()
    const close = vi.spyOn(gateway, "closeSession")
    const early = new Date(EXPIRES.getTime() - 1_000)

    const { result } = await addToCart(
      { productId: ryzen, quantity: 1 },
      options(gateway, early)
    )
    expect(result).toEqual({ ok: false, reason: "unavailable" })
    expect(close).not.toHaveBeenCalled()
    expect(await orderOf(p1.id)).toMatchObject({ status: "PENDING_PAYMENT" })
  })

  it("rolls the release back with a failed add (S5)", async () => {
    const { ryzen, p1 } = await setup()
    const original = db.$transaction.bind(db)
    vi.spyOn(db, "$transaction").mockImplementation(((
      fn: (tx: unknown) => Promise<unknown>,
      opts?: unknown
    ) =>
      original(async (tx) => {
        await fn(tx)
        throw new Error("forced")
      }, opts as never)) as never)

    const { result } = await addToCart(
      { productId: ryzen, quantity: 1 },
      options()
    )
    expect(result).toEqual({ ok: false, reason: "error" })
    expect(await orderOf(p1.id)).toMatchObject({ status: "PENDING_PAYMENT" })
    expect(await stockOf(ryzen)).toBe(0)
  })

  it("goes on without a release when the check fails (S6)", async () => {
    const { ryzen, p1 } = await setup()
    vi.spyOn(db, "$queryRaw").mockRejectedValueOnce(new Error("forced"))

    const { result } = await addToCart(
      { productId: ryzen, quantity: 1 },
      options()
    )
    expect(result).toEqual({ ok: false, reason: "unavailable" })
    expect(await orderOf(p1.id)).toMatchObject({ status: "PENDING_PAYMENT" })
  })
})

describe("raising a quantity", () => {
  it("frees stock for the line, up to the cap (S2)", async () => {
    const { ryzen, p1 } = await setup()
    const cartId = newCartId()
    await db.cart.create({ data: { id: cartId } })
    const line = await db.cartItem.create({
      data: { cartId, productId: ryzen, quantity: 1 },
    })

    const { result } = await setCartQuantity(
      { lineId: line.id, quantity: 3 },
      { ...options(), cartId }
    )
    expect(result).toMatchObject({
      ok: true,
      line: { id: line.id, quantity: 2 },
    })
    expect(result).toHaveProperty("note")
    expect(await orderOf(p1.id)).toMatchObject({ status: "CANCELLED" })
    expect(await stockOf(ryzen)).toBe(2)
  })
})

describe("add build to cart", () => {
  it("frees a part the build needs (S3)", async () => {
    const { ids, ryzen, p1 } = await setup()
    const items = itemsWithIds(buildA(), ids)
    const first = await addBuildToCart(
      { items, acknowledgedWarnings: [] },
      options()
    )
    // Build A may ask the shopper to confirm warnings first
    const outcome =
      !first.result.ok && first.result.reason === "confirm"
        ? await addBuildToCart(
            {
              items,
              acknowledgedWarnings: first.result.warnings.map(warningKey),
            },
            options()
          )
        : first

    expect(outcome.result).toMatchObject({ ok: true, status: "added" })
    expect(await orderOf(p1.id)).toMatchObject({ status: "CANCELLED" })
    expect(await stockOf(ryzen)).toBe(2)
  })
})

describe("placing an order", () => {
  const contact = {
    email: "ana@example.com",
    name: "Ana Santos",
    mobile: "0917 123 4567",
  }

  // B's cart (one Ryzen), reviewed while one unit is left; then another
  // order takes it
  async function reviewedThenTaken() {
    const { ids, ryzen, p1, session } = await setup(3)
    const cartId = newCartId()
    await db.cart.create({ data: { id: cartId } })
    await db.cartItem.create({
      data: { cartId, productId: ryzen, quantity: 1 },
    })
    const review = await reviewCheckout(cartId, { method: "pickup", contact })
    if (!review.ok) throw new Error(review.reason)
    await heldOrder([{ productId: ryzen, quantity: 1 }], {
      expiresAt: new Date("2026-11-03T07:00:00Z"),
    })
    expect(await stockOf(ryzen)).toBe(0)
    const request = {
      details: { method: "pickup", contact },
      digest: review.digest,
      idempotencyKey: review.idempotencyKey,
      accessToken: review.accessToken,
    }
    return { ids, ryzen, p1, session, cartId, request }
  }

  it("frees the stock it needs inside the placement (S4, S7)", async () => {
    const { ryzen, p1, cartId, request } = await reviewedThenTaken()

    const placed = await placeOrder(cartId, request, {
      now: NOW,
      gateway: lagging(),
    })
    expect(placed).toMatchObject({ ok: true })
    expect(await orderOf(p1.id)).toMatchObject({ status: "CANCELLED" })
    expect(await stockOf(ryzen)).toBe(1)
    const movements = await db.stockMovement.findMany({
      where: { productId: ryzen },
      orderBy: { createdAt: "asc" },
    })
    expect(
      movements.map(({ reason, change }) => [reason, change]).slice(-2)
    ).toEqual(
      expect.arrayContaining([
        ["ORDER_RELEASED", 2],
        ["ORDER_RESERVED", -1],
      ])
    )

    // S7: the same request again returns the order and releases nothing more
    expect(
      await placeOrder(cartId, request, { now: NOW, gateway: lagging() })
    ).toEqual(placed)
    expect(
      await db.stockMovement.count({ where: { reason: "ORDER_RELEASED" } })
    ).toBe(1)
  })

  it("calls the gateway only outside the transaction (S8)", async () => {
    const { p1, cartId, request } = await reviewedThenTaken()
    const gateway = guardTransactions(lagging())
    expect(
      await placeOrder(cartId, request, { now: NOW, gateway })
    ).toMatchObject({ ok: true })
    expect(await orderOf(p1.id)).toMatchObject({ status: "CANCELLED" })
  })

  it("rolls the release back with a refused placement (S4a)", async () => {
    const { ryzen, p1, session, cartId, request } = await reviewedThenTaken()
    await db.product.update({ where: { id: ryzen }, data: { price: 999_900 } })

    expect(
      await placeOrder(cartId, request, { now: NOW, gateway: lagging() })
    ).toEqual({ ok: false, reason: "changed" })
    expect(await orderOf(p1.id)).toMatchObject({ status: "PENDING_PAYMENT" })
    expect(await stockOf(ryzen)).toBe(0)
    expect(
      await db.stockMovement.count({ where: { reason: "ORDER_RELEASED" } })
    ).toBe(0)
    // Step 1 isn't undone: the session stays cancelled (R10 then releases)
    expect(await fakeStatus(session)).toBe("CANCELED")
  })
})

describe("when the gateway is slow or down (S9)", () => {
  it("goes on normally after a timeout (S9)", async () => {
    const { ryzen, p1, session } = await setup()
    const down = fakeGateway({
      now: () => PLACED,
      fail: { close: true, code: "timeout" },
    })

    const { result } = await addToCart(
      { productId: ryzen, quantity: 1 },
      options(down)
    )
    expect(result).toEqual({ ok: false, reason: "unavailable" })
    expect(await orderOf(p1.id)).toMatchObject({ status: "PENDING_PAYMENT" })
    expect(await fakeStatus(session)).toBe("ACTIVE")
    expect(logLines()).toEqual([
      {
        event: "order.release",
        outcome: "skipped",
        orderNumber: p1.orderNumber,
        via: "purchase",
        code: "timeout",
      },
    ])

    // S9c: once it answers again, a sweep releases the order
    expect(
      await sweepExpiredOrders(NOW, {
        gateway: lagging(),
        environment: "development",
      })
    ).toMatchObject({ released: 1 })
  })

  it("stops waiting after the purchase timeout (S9a)", async () => {
    const { ryzen } = await setup()
    const slow = fakeGateway({ now: () => PLACED, closeDelayMs: 10_000 })

    const started = Date.now()
    const { result } = await addToCart(
      { productId: ryzen, quantity: 1 },
      options(slow)
    )
    const waited = Date.now() - started
    expect(result).toEqual({ ok: false, reason: "unavailable" })
    expect(waited).toBeGreaterThanOrEqual(2_400)
    expect(waited).toBeLessThan(5_000)
  }, 15_000)

  it("calls the gateway no more after the first failure (S9b)", async () => {
    const { ryzen, p1 } = await setup(3)
    const second = await heldOrder([{ productId: ryzen, quantity: 1 }], {
      accessTokenHash: releaseTokenHash("U".repeat(43)),
      expiresAt: new Date(EXPIRES.getTime() + 60_000),
    })
    await openSession(second.id, "U".repeat(43))
    const down = fakeGateway({
      now: () => PLACED,
      fail: { close: true, code: "timeout" },
    })
    const close = vi.spyOn(down, "closeSession")

    await addToCart(
      { productId: ryzen, quantity: 1 },
      options(down, new Date(EXPIRES.getTime() + 120_000))
    )
    expect(close).toHaveBeenCalledTimes(1)
    expect(
      logLines().map(({ orderNumber, code }) => [orderNumber, code])
    ).toEqual([
      [p1.orderNumber, "timeout"],
      [second.orderNumber, "budget"],
    ])
  })
})

describe("no gateway call inside a transaction (S8)", () => {
  it("in add to cart (S1)", async () => {
    const { ryzen } = await setup()
    const gateway = guardTransactions(lagging())
    expect(
      (await addToCart({ productId: ryzen, quantity: 1 }, options(gateway)))
        .result
    ).toMatchObject({ ok: true })
  })
})
