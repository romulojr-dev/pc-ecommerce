import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { db, resetCatalog } from "@/test-support/db"
import { expectNoRawValues, FIXTURE_PARCEL } from "@/test-support/no-raw-values"
import { orderData } from "@/test-support/orders"

import { getOrderDetail, getPackingSlip } from "./orders"

// docs/specs/043-order-fulfillment-transitions: the parcel on the detail and
// the packing slip, in full for Owner and Staff, masked for Demo (B11, B12,
// R6a, E30, E30a)

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

const T = new Date("2026-11-03T03:00:00Z")
const NOW = new Date("2026-11-06T05:00:00Z")

async function shipped() {
  return db.order.create({
    data: orderData({
      status: "SHIPPED",
      paidAt: T,
      processingAt: T,
      shippedAt: T,
      ...FIXTURE_PARCEL,
    }),
  })
}

describe("the order detail", () => {
  it("E30: Owner and Staff see the courier and the whole number, with the times", async () => {
    const order = await shipped()
    for (const role of ["owner", "staff"] as const) {
      const detail = await getOrderDetail(role, order.orderNumber, NOW)
      expect(detail).toMatchObject({
        processingAt: T,
        shippedAt: T,
        readyAt: null,
        completedAt: null,
        parcel: { masked: false, ...FIXTURE_PARCEL },
      })
    }
  })

  it("E30a: Demo sees the courier and the last four, and nothing else of the number", async () => {
    const order = await shipped()
    const detail = await getOrderDetail("demo", order.orderNumber, NOW)
    expect(detail?.parcel).toEqual({
      masked: true,
      courier: "LBC",
      trackingNumber: "•••• 4821",
    })
    // the fixture's customer values are absent too (spec 040's helper)
    expectNoRawValues(detail, [
      FIXTURE_PARCEL.trackingNumber,
      "123456784",
      "ana@example.com",
    ])
  })

  it("an order that has not shipped has no parcel", async () => {
    const order = await db.order.create({
      data: orderData({ status: "PAID", paidAt: T }),
    })
    expect(
      (await getOrderDetail("owner", order.orderNumber, NOW))?.parcel
    ).toBe(null)
  })
})

describe("the packing slip", () => {
  it("prints the parcel in full for Owner and masked for Demo", async () => {
    const order = await shipped()
    expect((await getPackingSlip("owner", order.orderNumber))?.parcel).toEqual({
      masked: false,
      ...FIXTURE_PARCEL,
    })
    const demo = await getPackingSlip("demo", order.orderNumber)
    expect(demo?.parcel).toMatchObject({
      masked: true,
      trackingNumber: "•••• 4821",
    })
    expectNoRawValues(demo, [FIXTURE_PARCEL.trackingNumber, "123456784"])
  })
})
