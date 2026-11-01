import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { newCartId } from "@/lib/cart/id"
import { reviewCheckout } from "@/lib/checkout/review-checkout"
import { shippingSeed } from "@/prisma/seed/data/shipping"
import { writeSeed } from "@/prisma/seed/write"
import { insertParts } from "@/test-support/build-fixtures"
import { db, resetCatalog } from "@/test-support/db"
import { seed } from "@/test-support/seed-parts"

import { placeOrderAction, reviewCheckoutAction } from "./actions"

// docs/specs/030-place-an-order: Z2, Z6 and the action's shape. The cookie and
// the switch are the two things the action reads from outside, so those are
// replaced; everything else is real.

const state = vi.hoisted(() => ({
  cartId: null as string | null,
  enabled: true,
  // The fake gateway refuses to create sessions (spec 031, Behavior 2)
  gatewayFails: false,
}))
vi.mock("@/lib/cart/cookie", () => ({
  readCartId: async () => state.cartId,
}))
vi.mock("@/lib/orders/enabled", () => ({ ordersEnabled: () => state.enabled }))
vi.mock("@/lib/payments/gateway", async (importOriginal) => {
  const { fakeGateway } = await import("@/lib/payments/fake")
  return {
    ...(await importOriginal<typeof import("@/lib/payments/gateway")>()),
    gateway: () => fakeGateway({ fail: { create: state.gatewayFails } }),
  }
})
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidateTag: vi.fn(),
}))

beforeEach(async () => {
  await resetCatalog()
  await writeSeed(db, [], { reset: false, shipping: shippingSeed })
  state.enabled = true
  state.gatewayFails = false
})
afterAll(() => db.$disconnect())

const pickup = {
  method: "pickup",
  contact: {
    email: "ana@example.com",
    name: "Ana Santos",
    mobile: "0917 123 4567",
  },
}

async function cartWithRyzen() {
  const ids = await insertParts([seed.ryzen5_7600])
  const cartId = newCartId()
  await db.cart.create({ data: { id: cartId } })
  await db.cartItem.create({
    data: { cartId, productId: ids.get(seed.ryzen5_7600.id)!, quantity: 1 },
  })
  state.cartId = cartId
  return { cartId, productId: ids.get(seed.ryzen5_7600.id)! }
}

async function freshRequest(cartId: string) {
  const review = await reviewCheckout(cartId, pickup)
  if (!review.ok) throw new Error("review failed")
  return {
    details: pickup,
    digest: review.digest,
    idempotencyKey: review.idempotencyKey,
    accessToken: review.accessToken,
  }
}

describe("placeOrderAction", () => {
  it("Z2: with the switch off it refuses before reading anything", async () => {
    const { cartId, productId } = await cartWithRyzen()
    const request = await freshRequest(cartId)
    state.enabled = false

    expect(await placeOrderAction(request)).toEqual({
      ok: false,
      reason: "disabled",
    })
    // Not even a malformed body gets past the switch to the parser
    expect(await placeOrderAction("not a request")).toEqual({
      ok: false,
      reason: "disabled",
    })

    expect(await db.order.count()).toBe(0)
    expect(await db.cartItem.count({ where: { cartId } })).toBe(1)
    const product = await db.product.findUniqueOrThrow({
      where: { id: productId },
    })
    expect(product.stock).toBe(10)
  })

  it("Z6: with it on, returns the order link and a count of 0", async () => {
    const { cartId } = await cartWithRyzen()
    const request = await freshRequest(cartId)

    const result = await placeOrderAction(request)

    expect(result).toMatchObject({ ok: true, count: 0 })
    if (!result.ok) return
    expect(result.link).toBe(
      `/orders/${(await db.order.findFirstOrThrow()).orderNumber}?key=${request.accessToken}`
    )
    expect(result.link).toMatch(
      /^\/orders\/PCS-[0-9A-HJKMNP-TV-Z]{8}\?key=[A-Za-z0-9_-]{43}$/
    )
  })

  it("goes straight to a payment session (spec 031, Behavior 1, A1)", async () => {
    const { cartId } = await cartWithRyzen()
    const request = await freshRequest(cartId)

    const result = await placeOrderAction(request)

    if (!result.ok) throw new Error(result.reason)
    const payment = await db.payment.findFirstOrThrow()
    expect(result.payUrl).toBe(
      `/test-payment/${payment.providerRef}?key=${request.accessToken}`
    )
    expect(payment).toMatchObject({ status: "PENDING", provider: "FAKE" })
  })

  it("closes the first session when Place order is replayed (spec 031, A10)", async () => {
    const { cartId } = await cartWithRyzen()
    const request = await freshRequest(cartId)

    const first = await placeOrderAction(request)
    const again = await placeOrderAction(request)

    if (!first.ok || !again.ok) throw new Error("not placed")
    expect(again.link).toBe(first.link)
    expect(again.payUrl).not.toBe(first.payUrl)
    expect(await db.order.count()).toBe(1)
    const rows = await db.payment.findMany({ orderBy: { createdAt: "asc" } })
    expect(rows.map((p) => [p.referenceId.slice(-2), p.status])).toEqual([
      ["-1", "EXPIRED"],
      ["-2", "PENDING"],
    ])
  })

  it("lands on the order with payment=error when no session opens (spec 031, Behavior 2)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { cartId } = await cartWithRyzen()
    const request = await freshRequest(cartId)
    state.gatewayFails = true

    const result = await placeOrderAction(request)

    if (!result.ok) throw new Error(result.reason)
    expect(result.payUrl).toBeNull()
    expect(result.link).toMatch(/\?key=[A-Za-z0-9_-]{43}&payment=error$/)
    expect(await db.order.count()).toBe(1)
    expect(await db.payment.count()).toBe(0)
  })

  it("takes the cart from the cookie, not from the request", async () => {
    const { cartId } = await cartWithRyzen()
    const request = await freshRequest(cartId)
    state.cartId = null

    expect(await placeOrderAction({ ...request, cartId })).toEqual({
      ok: false,
      reason: "empty",
    })
    expect(await db.order.count()).toBe(0)
  })

  it("passes a refusal through", async () => {
    const { cartId, productId } = await cartWithRyzen()
    const request = await freshRequest(cartId)
    await db.product.update({ where: { id: productId }, data: { stock: 0 } })

    expect(await placeOrderAction(request)).toEqual({
      ok: false,
      reason: "changed",
    })
  })
})

describe("reviewCheckoutAction", () => {
  it("Z6: reports whether placing is on", async () => {
    await cartWithRyzen()

    const on = await reviewCheckoutAction(pickup)
    expect(on).toMatchObject({ ok: true, ordersEnabled: true })

    state.enabled = false
    const off = await reviewCheckoutAction(pickup)
    expect(off).toMatchObject({ ok: true, ordersEnabled: false })
  })

  it("leaves a refusal as it is", async () => {
    state.cartId = null
    expect(await reviewCheckoutAction(pickup)).toEqual({
      ok: false,
      reason: "empty",
    })
  })
})
