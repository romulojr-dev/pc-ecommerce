import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { newCartId } from "@/lib/cart/id"
import { reviewCheckout } from "@/lib/checkout/review-checkout"
import { completeFakeSession, fakeGateway } from "@/lib/payments/fake"
import { shippingSeed } from "@/prisma/seed/data/shipping"
import { writeSeed } from "@/prisma/seed/write"
import { insertParts } from "@/test-support/build-fixtures"
import { db, resetCatalog } from "@/test-support/db"
import { paymentData } from "@/test-support/payments"
import {
  EXPIRES,
  heldOrder,
  openSession,
  PLACED,
  releaseTokenHash,
} from "@/test-support/release"
import { seed } from "@/test-support/seed-parts"

import { placeOrder } from "./place-order"
import { sweepExpiredOrders } from "./release"

// docs/specs/037-vouchers-at-checkout: R1–R8, the release giving a voucher's
// use back. Orders come from the release tests' `heldOrder` (as placement
// leaves them); the P1 order of spec 033 holds 2 Ryzen 5 7600s and is due at
// NOW.

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidateTag: vi.fn(),
}))

beforeEach(async () => {
  await resetCatalog()
  await writeSeed(db, [], { reset: false, shipping: shippingSeed })
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const NOW = EXPIRES
const lagging = () => fakeGateway({ now: () => PLACED })
const sweep = (gateway = lagging()) =>
  sweepExpiredOrders(NOW, { gateway, environment: "development" })

async function setup() {
  const ids = await insertParts([seed.ryzen5_7600], {
    [seed.ryzen5_7600.id]: { stock: 40, price: 1_149_500 },
  })
  return ids.get(seed.ryzen5_7600.id)!
}

async function voucher(overrides: Record<string, unknown> = {}) {
  return db.voucher.create({
    data: {
      code: "TEST",
      type: "FIXED",
      value: 100_000,
      startsAt: new Date("2026-01-01T00:00:00+08:00"),
      usedCount: 1,
      ...overrides,
    } as Parameters<typeof db.voucher.create>[0]["data"],
  })
}

// An order holding one Ryzen and one use of `v`, as placement would leave it
async function orderWith(
  ryzen: string,
  v: { id: string; code: string },
  overrides: Parameters<typeof heldOrder>[1] = {}
) {
  return heldOrder([{ productId: ryzen, quantity: 1 }], {
    accessTokenHash: releaseTokenHash(`token-${Math.random()}`),
    subtotal: 2_299_000,
    shippingFee: 12_000,
    discount: 100_000,
    total: 2_211_000,
    voucherId: v.id,
    voucherCode: v.code,
    ...overrides,
  } as Parameters<typeof heldOrder>[1])
}

const usedOf = async (code: string) =>
  (await db.voucher.findUniqueOrThrow({ where: { code } })).usedCount

describe("the release gives a voucher's use back", () => {
  it("R1: cancels the order, gives the use back and keeps the snapshot", async () => {
    const ryzen = await setup()
    const v = await voucher()
    const order = await orderWith(ryzen, v)

    expect(await sweep()).toMatchObject({ released: 1 })

    expect(await usedOf("TEST")).toBe(0)
    expect(
      await db.order.findUniqueOrThrow({ where: { id: order.id } })
    ).toMatchObject({
      status: "CANCELLED",
      voucherId: v.id,
      voucherCode: "TEST",
      discount: 100_000,
    })
  })

  it("R2: a second sweep gives nothing more back", async () => {
    const ryzen = await setup()
    const v = await voucher({ usedCount: 2 })
    await orderWith(ryzen, v)

    await sweep()
    await sweep()
    const [a, b] = await Promise.all([sweep(), sweep()])

    expect(a.released + b.released).toBe(0)
    expect(await usedOf("TEST")).toBe(1)
  })

  it("R3: gives the use back although the voucher has since ended", async () => {
    const ryzen = await setup()
    const v = await voucher()
    await orderWith(ryzen, v)
    await db.voucher.update({
      where: { code: "TEST" },
      data: { endsAt: new Date("2026-02-01T00:00:00Z") },
    })

    await sweep()

    expect(await usedOf("TEST")).toBe(0)
  })

  it("R4: an order whose session turns out paid keeps its use", async () => {
    const ryzen = await setup()
    const v = await voucher()
    const order = await orderWith(ryzen, v, {
      accessTokenHash: releaseTokenHash(),
    })
    const session = await openSession(order.id)
    await completeFakeSession(session, PLACED)

    expect(await sweep()).toMatchObject({ released: 0, skipped: 1 })

    expect(
      await db.order.findUniqueOrThrow({ where: { id: order.id } })
    ).toMatchObject({ status: "PAID" })
    expect(await usedOf("TEST")).toBe(1)
  })

  it("R5: an order with a payment that needs checking keeps its use", async () => {
    const ryzen = await setup()
    const v = await voucher()
    const order = await orderWith(ryzen, v)
    await db.payment.create({
      data: paymentData(order.id, {
        status: "PAID",
        paidAt: PLACED,
        problem: "AMOUNT_MISMATCH",
        receivedAmount: 2_210_000,
      }),
    })

    expect(await sweep()).toMatchObject({ released: 0 })

    expect(await usedOf("TEST")).toBe(1)
  })

  // Another shopper buys the same part; the placement releases the due order
  // inside its transaction (spec 033, behavior 17–18)
  async function purchaseOf(
    ryzen: string,
    afterStep?: Parameters<typeof placeOrder>[2] extends infer O
      ? O extends { afterStep?: infer A }
        ? A
        : never
      : never
  ) {
    const cart = newCartId()
    await db.cart.create({ data: { id: cart } })
    await db.cartItem.create({
      data: { cartId: cart, productId: ryzen, quantity: 1 },
    })
    const details = {
      method: "pickup",
      contact: {
        email: "ana@example.com",
        name: "Ana Santos",
        mobile: "0917 123 4567",
      },
    }
    const review = await reviewCheckout(cart, details)
    if (!review.ok) throw new Error("review failed")
    return placeOrder(
      cart,
      {
        details,
        digest: review.digest,
        idempotencyKey: review.idempotencyKey,
        accessToken: review.accessToken,
      },
      { now: NOW, gateway: lagging(), afterStep }
    )
  }

  it("R6: a purchase that commits releases the due order and gives the use back", async () => {
    const ryzen = await setup()
    const v = await voucher()
    const held = await orderWith(ryzen, v)

    expect((await purchaseOf(ryzen)).ok).toBe(true)

    expect(
      await db.order.findUniqueOrThrow({ where: { id: held.id } })
    ).toMatchObject({ status: "CANCELLED" })
    expect(await usedOf("TEST")).toBe(0)
  })

  it("R6: a purchase that rolls back after releasing leaves the use alone", async () => {
    const ryzen = await setup()
    const v = await voucher()
    const held = await orderWith(ryzen, v)

    const result = await purchaseOf(ryzen, (step) => {
      if (step === "order") throw new Error("boom")
    })

    expect(result).toEqual({ ok: false, reason: "error" })
    expect(
      await db.order.findUniqueOrThrow({ where: { id: held.id } })
    ).toMatchObject({ status: "PENDING_PAYMENT" })
    expect(await usedOf("TEST")).toBe(1)
  })

  it("R7: two orders with one code give two uses back in one run", async () => {
    const ryzen = await setup()
    const v = await voucher({ usedCount: 3 })
    await orderWith(ryzen, v)
    await orderWith(ryzen, v)

    expect(await sweep()).toMatchObject({ released: 2 })

    expect(await usedOf("TEST")).toBe(1)
  })

  it("R7: orders with different codes give each its own back", async () => {
    const ryzen = await setup()
    const a = await voucher({ code: "AAA", usedCount: 1 })
    const b = await voucher({ code: "BBB", usedCount: 2 })
    await orderWith(ryzen, a)
    await orderWith(ryzen, b)
    await orderWith(ryzen, b)

    await sweep()

    expect(await usedOf("AAA")).toBe(0)
    expect(await usedOf("BBB")).toBe(0)
  })

  it("R8: an order with no voucher touches no voucher", async () => {
    const ryzen = await setup()
    await voucher({ usedCount: 1 })
    await heldOrder([{ productId: ryzen, quantity: 1 }], {
      accessTokenHash: releaseTokenHash(`token-${Math.random()}`),
    })

    expect(await sweep()).toMatchObject({ released: 1 })

    expect(await usedOf("TEST")).toBe(1)
  })
})
