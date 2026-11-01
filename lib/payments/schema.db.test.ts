import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { db, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"
import { paymentData, sessionId } from "@/test-support/payments"

// What the database itself guarantees for payments (docs/specs/031-pay-with-
// xendit, §4 One open session per order, §6 Schema). Whatever the app does,
// these hold.

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

const newOrder = () => db.order.create({ data: orderData() })

describe("one open session per order", () => {
  it("refuses a second pending payment for the same order", async () => {
    const order = await newOrder()
    await db.payment.create({ data: paymentData(order.id) })
    await expect(
      db.payment.create({ data: paymentData(order.id) })
    ).rejects.toThrow()
  })

  it("allows any number of closed payments beside the open one", async () => {
    const order = await newOrder()
    for (const status of ["EXPIRED", "EXPIRED", "FAILED"] as const) {
      await db.payment.create({ data: paymentData(order.id, { status }) })
    }
    await db.payment.create({ data: paymentData(order.id) })
    expect(await db.payment.count({ where: { orderId: order.id } })).toBe(4)
  })

  it("lets two orders each have one open", async () => {
    const [a, b] = [await newOrder(), await newOrder()]
    await db.payment.create({ data: paymentData(a.id) })
    await db.payment.create({ data: paymentData(b.id) })
    expect(await db.payment.count({ where: { status: "PENDING" } })).toBe(2)
  })
})

describe("Payment columns", () => {
  it("refuses the same session twice for a provider", async () => {
    const order = await newOrder()
    const ref = sessionId()
    await db.payment.create({
      data: paymentData(order.id, { providerRef: ref, status: "EXPIRED" }),
    })
    await expect(
      db.payment.create({ data: paymentData(order.id, { providerRef: ref }) })
    ).rejects.toThrow()
  })

  it.each([0, -100])("refuses an amount of %i", async (amount) => {
    const order = await newOrder()
    await expect(
      db.payment.create({ data: paymentData(order.id, { amount }) })
    ).rejects.toThrow()
  })

  it("keeps an order with payments from being deleted (never hard-deleted)", async () => {
    const order = await newOrder()
    await db.payment.create({ data: paymentData(order.id) })
    await expect(db.order.delete({ where: { id: order.id } })).rejects.toThrow()
  })
})

describe("FakeGatewaySession", () => {
  const session = (status: string) => ({
    id: sessionId(),
    status,
    amount: 2_311_000,
    currency: "PHP",
    referenceId: "PCS-7KQ2M9XD-1",
    metadata: {},
    expiresAt: new Date("2026-11-01T07:42:00Z"),
  })

  it.each(["ACTIVE", "COMPLETED", "EXPIRED", "CANCELED"])(
    "accepts %s",
    async (status) => {
      await db.fakeGatewaySession.create({ data: session(status) })
    }
  )

  it("refuses a status Xendit doesn't use", async () => {
    await expect(
      db.fakeGatewaySession.create({ data: session("PAID") })
    ).rejects.toThrow()
  })
})

describe("resetCatalog", () => {
  it("empties the payment tables", async () => {
    const order = await newOrder()
    await db.payment.create({ data: paymentData(order.id) })
    await db.fakeGatewaySession.create({
      data: {
        id: sessionId(),
        status: "ACTIVE",
        amount: 1,
        currency: "PHP",
        referenceId: "x",
        metadata: {},
        expiresAt: new Date(),
      },
    })
    await resetCatalog()
    expect(await db.payment.count()).toBe(0)
    expect(await db.fakeGatewaySession.count()).toBe(0)
  })
})
