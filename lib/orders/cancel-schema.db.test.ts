import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { db, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"

// docs/specs/044-admin-cancel-order: R5, E26. The staff reasons are valid
// values, and the CHECKs on cancelled and pending orders still hold.

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

const NOW = new Date("2026-11-07T01:00:00Z")

describe("the cancel reasons and the cancelled CHECKs", () => {
  it.each(["OUT_OF_STOCK", "CUSTOMER_REQUEST", "OTHER", "EXPIRED"] as const)(
    "accepts a cancelled order with reason %s",
    async (cancelReason) => {
      const order = await db.order.create({
        data: orderData({
          status: "CANCELLED",
          cancelledAt: NOW,
          cancelReason,
        }),
      })
      expect(order.cancelReason).toBe(cancelReason)
    }
  )

  it("refuses a cancelled order with no reason or no time", async () => {
    await expect(
      db.order.create({
        data: orderData({ status: "CANCELLED", cancelledAt: NOW }),
      })
    ).rejects.toThrow()
    await expect(
      db.order.create({
        data: orderData({ status: "CANCELLED", cancelReason: "OTHER" }),
      })
    ).rejects.toThrow()
  })

  it("refuses a pending order that has a cancellation time", async () => {
    await expect(
      db.order.create({
        data: orderData({ status: "PENDING_PAYMENT", cancelledAt: NOW }),
      })
    ).rejects.toThrow()
  })
})
