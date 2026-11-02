import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { hashToken, newAccessToken } from "@/lib/orders/secrets"
import { db, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"

import { startPaymentAction } from "./actions"

// Pay now's action (docs/specs/031-pay-with-xendit, Behavior 4, 13): the
// order is opened by its number and key, with the page's own checks

vi.mock("@/lib/payments/gateway", async (importOriginal) => {
  const { fakeGateway } = await import("@/lib/payments/fake")
  return {
    ...(await importOriginal<typeof import("@/lib/payments/gateway")>()),
    gateway: () => fakeGateway(),
  }
})

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

const TOKEN = newAccessToken()

async function newOrder() {
  return db.order.create({
    data: orderData({
      accessTokenHash: hashToken(TOKEN),
      // Far enough ahead for any clock this runs on
      expiresAt: new Date(Date.now() + 24 * 3_600_000),
    }),
  })
}

describe("startPaymentAction", () => {
  it("opens a session for the right number and key", async () => {
    const order = await newOrder()
    const result = await startPaymentAction({
      orderNumber: order.orderNumber,
      key: TOKEN,
    })
    expect(result).toMatchObject({ ok: true })
    expect(await db.payment.count()).toBe(1)
  })

  it("passes opening through while another start is in flight (spec 034, B10)", async () => {
    const order = await newOrder()
    await db.payment.create({
      data: {
        orderId: order.id,
        provider: "FAKE",
        status: "OPENING",
        referenceId: `${order.orderNumber}-1`,
        amount: order.total,
        expiresAt: order.expiresAt,
      },
    })
    expect(
      await startPaymentAction({ orderNumber: order.orderNumber, key: TOKEN })
    ).toEqual({ ok: false, reason: "opening" })
  })

  it.each([
    ["a wrong key", (n: string) => ({ orderNumber: n, key: newAccessToken() })],
    ["no key", (n: string) => ({ orderNumber: n })],
    ["an unknown number", () => ({ orderNumber: "PCS-AAAAAAAA", key: TOKEN })],
    ["a malformed number", () => ({ orderNumber: "nope", key: TOKEN })],
    ["not an object", () => "PCS-AAAAAAAA"],
  ])("answers not-found for %s, writing nothing", async (_, input) => {
    const order = await newOrder()
    expect(await startPaymentAction(input(order.orderNumber))).toEqual({
      ok: false,
      reason: "not-found",
    })
    expect(await db.payment.count()).toBe(0)
  })
})
