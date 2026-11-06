import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { db, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"
import { paymentData } from "@/test-support/payments"

import { getOrderForPage } from "./get-order"
import { hashToken, newAccessToken } from "./secrets"

// docs/specs/044-admin-cancel-order: R13, E24. The order page's DTO says
// whether anything was received, counting a late payment on an expired order.

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

const TOKEN = newAccessToken()
const PAID_AT = new Date("2026-11-01T07:30:00Z")
const CANCELLED_AT = new Date("2026-11-02T08:00:00Z")

async function cancelled(data: Parameters<typeof orderData>[0] = {}) {
  return db.order.create({
    data: orderData({
      status: "CANCELLED",
      cancelledAt: CANCELLED_AT,
      cancelReason: "EXPIRED",
      accessTokenHash: hashToken(TOKEN),
      ...data,
    }),
  })
}

describe("the order page's nothingReceived", () => {
  it("is true for an expired order with no payment, and carries when it was cancelled", async () => {
    const order = await cancelled()
    const page = await getOrderForPage(order.orderNumber, TOKEN)
    expect(page).toMatchObject({
      nothingReceived: true,
      cancelledAt: CANCELLED_AT,
      cancelReason: "EXPIRED",
    })
  })

  it("is false for an expired order that later received a late payment", async () => {
    const order = await cancelled({ refundRequired: true })
    await db.payment.create({
      data: paymentData(order.id, {
        status: "PAID",
        problem: "LATE",
        paidAt: PAID_AT,
      }),
    })
    const page = await getOrderForPage(order.orderNumber, TOKEN)
    expect(page?.nothingReceived).toBe(false)
  })

  it("is false for a cancelled paid order", async () => {
    const order = await cancelled({
      cancelReason: "CUSTOMER_REQUEST",
      paidAt: PAID_AT,
      refundRequired: true,
    })
    const page = await getOrderForPage(order.orderNumber, TOKEN)
    expect(page?.nothingReceived).toBe(false)
  })
})
