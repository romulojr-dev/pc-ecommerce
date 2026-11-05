import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { db, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"

import { getOrderForPage } from "./get-order"
import { hashToken, newAccessToken } from "./secrets"

// docs/specs/043-order-fulfillment-transitions: the customer's page carries
// the fulfillment times and the parcel (B20, E24, E26)

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

const TOKEN = newAccessToken()
const T = new Date("2026-11-03T03:00:00Z")

describe("getOrderForPage", () => {
  it("E24: returns the times, courier and tracking number of a shipped order", async () => {
    const order = await db.order.create({
      data: orderData({
        accessTokenHash: hashToken(TOKEN),
        status: "SHIPPED",
        paidAt: T,
        processingAt: T,
        shippedAt: T,
        courier: "LBC",
        trackingNumber: "123456784821",
      }),
    })
    const page = await getOrderForPage(order.orderNumber, TOKEN)
    expect(page).toMatchObject({
      status: "SHIPPED",
      processingAt: T,
      shippedAt: T,
      readyAt: null,
      completedAt: null,
      courier: "LBC",
      trackingNumber: "123456784821",
    })
  })

  it("E26: an order with no stored times reads null for all of them", async () => {
    const order = await db.order.create({
      data: orderData({
        accessTokenHash: hashToken(TOKEN),
        status: "PAID",
        paidAt: T,
      }),
    })
    expect(await getOrderForPage(order.orderNumber, TOKEN)).toMatchObject({
      processingAt: null,
      shippedAt: null,
      courier: null,
      trackingNumber: null,
    })
  })
})
