import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { db, resetCatalog } from "@/test-support/db"
import { orderData, pickupOrderData } from "@/test-support/orders"

// What the database itself guarantees for fulfillment (docs/specs/043-order-
// fulfillment-transitions): E29, E29a, E29b, E29c. CHECKs are migration-only,
// so only these tests cover them (db:drift doesn't compare them).

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

const T = new Date("2026-11-03T03:00:00Z")
type Data = Parameters<typeof orderData>[0]
const create = (data: Data) => db.order.create({ data: orderData(data) })
const parcel = { courier: "LBC", trackingNumber: "123456784821" }

describe("shippedAt implies courier and tracking (E29)", () => {
  it.each([
    ["no courier", { courier: null, trackingNumber: "123456784821" }],
    ["no tracking number", { courier: "LBC", trackingNumber: null }],
    ["neither", { courier: null, trackingNumber: null }],
  ])("refuses shippedAt with %s, whatever the status", async (_n, patch) => {
    for (const status of ["PROCESSING", "SHIPPED", "REFUNDED"] as const) {
      await expect(
        create({ status, paidAt: T, shippedAt: T, ...patch })
      ).rejects.toThrow()
    }
  })

  it("accepts shippedAt with both, and a Processing row with none of the three", async () => {
    await create({ status: "SHIPPED", paidAt: T, shippedAt: T, ...parcel })
    await create({ status: "PROCESSING", paidAt: T, processingAt: T })
    // a courier alone, before shipping, is not constrained
    await create({ status: "PROCESSING", paidAt: T, courier: "LBC" })
  })
})

describe("Shipped and Delivered imply shippedAt; Delivered and Picked up imply completedAt (E29b)", () => {
  it.each(["SHIPPED", "DELIVERED"] as const)(
    "refuses %s without shippedAt",
    async (status) => {
      await expect(
        create({
          status,
          paidAt: T,
          shippedAt: null,
          courier: null,
          trackingNumber: null,
          completedAt: T,
        })
      ).rejects.toThrow()
    }
  )

  it("refuses Delivered without completedAt", async () => {
    await expect(
      create({ status: "DELIVERED", paidAt: T, completedAt: null })
    ).rejects.toThrow()
  })

  it("refuses Picked up without completedAt, and accepts it with", async () => {
    await expect(
      create({
        ...pickupOrderData(),
        status: "PICKED_UP",
        paidAt: T,
        completedAt: null,
      })
    ).rejects.toThrow()
    await db.order.create({
      data: pickupOrderData({ status: "PICKED_UP", paidAt: T, completedAt: T }),
    })
  })

  it("accepts Processing and Ready for pickup without any of the times", async () => {
    await create({ status: "PROCESSING", paidAt: T })
    await db.order.create({
      data: pickupOrderData({ status: "READY_FOR_PICKUP", paidAt: T }),
    })
  })

  it("accepts a complete Shipped row", async () => {
    await create({ status: "SHIPPED", paidAt: T, shippedAt: T, ...parcel })
  })
})

describe("after REFUNDED (E29a, E29c)", () => {
  it("a Delivered order can be refunded and every check still holds", async () => {
    const order = await create({
      status: "DELIVERED",
      paidAt: T,
      shippedAt: T,
      completedAt: T,
      ...parcel,
    })
    const refunded = await db.order.update({
      where: { id: order.id },
      data: { status: "REFUNDED" },
    })
    expect(refunded).toMatchObject({ status: "REFUNDED", ...parcel })
    expect(refunded.shippedAt).toEqual(T)
    expect(refunded.completedAt).toEqual(T)
  })

  it("a Picked up order can be refunded", async () => {
    const order = await db.order.create({
      data: pickupOrderData({ status: "PICKED_UP", paidAt: T, completedAt: T }),
    })
    const refunded = await db.order.update({
      where: { id: order.id },
      data: { status: "REFUNDED" },
    })
    expect(refunded.status).toBe("REFUNDED")
  })

  it("a Refunded row without times or parcel passes; with shippedAt and no courier it fails", async () => {
    await create({ status: "REFUNDED", paidAt: T })
    await expect(
      create({
        status: "REFUNDED",
        paidAt: T,
        shippedAt: T,
        courier: null,
        trackingNumber: null,
      })
    ).rejects.toThrow()
  })
})
