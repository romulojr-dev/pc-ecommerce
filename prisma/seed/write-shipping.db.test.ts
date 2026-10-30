import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { db, resetCatalog } from "@/test-support/db"

import { shippingSeed } from "./data/shipping"
import { writeSeed } from "./write"

// The seed's shipping steps (docs/specs/028-shipping-data-and-fee-rules, S1–
// S4). No catalog parts are passed, so each run is quick; the catalog steps
// are write.db.test.ts's.

const seed = (reset = false) =>
  writeSeed(db, [], { reset, shipping: shippingSeed })

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

describe("the shipping seed", () => {
  it("S1: fills 20 rates and creates the settings row on an empty database", async () => {
    const counts = await seed()

    expect(counts).toMatchObject({ shippingRates: 20, settingsCreated: true })
    expect(await db.shippingRate.count()).toBe(20)
    for (const zone of [
      "METRO_MANILA",
      "LUZON",
      "VISAYAS",
      "MINDANAO",
    ] as const) {
      expect(await db.shippingRate.count({ where: { zone } })).toBe(5)
      expect(
        await db.shippingRate.count({ where: { zone, maxWeightGrams: null } })
      ).toBe(1)
    }
    const settings = await db.storeSettings.findUniqueOrThrow({
      where: { id: 1 },
    })
    expect(settings).toMatchObject({
      freeShippingThreshold: 7_500_000,
      pickupEnabled: true,
      orderExpiryHours: 24,
      storeAddress: shippingSeed.store.storeAddress,
      storeHours: shippingSeed.store.storeHours,
      storeInfo: shippingSeed.store.storeInfo,
    })
    expect(await db.storeSettings.count()).toBe(1)
  })

  it("S2: a re-seed keeps what Admin changed and adds nothing", async () => {
    await seed()
    const first = await db.shippingRate.findFirstOrThrow({
      where: { zone: "METRO_MANILA", maxWeightGrams: 1_000 },
    })
    await db.shippingRate.update({
      where: { id: first.id },
      data: { fee: 13_500 },
    })
    await db.storeSettings.update({
      where: { id: 1 },
      data: { freeShippingThreshold: null, storeHours: "Open all week" },
    })
    const ratesBefore = await db.shippingRate.findMany({
      orderBy: { id: "asc" },
    })

    const counts = await seed()

    expect(counts).toMatchObject({ shippingRates: 0, settingsCreated: false })
    expect(await db.shippingRate.findMany({ orderBy: { id: "asc" } })).toEqual(
      ratesBefore
    )
    expect(
      (await db.shippingRate.findUniqueOrThrow({ where: { id: first.id } })).fee
    ).toBe(13_500)
    expect(
      await db.storeSettings.findUniqueOrThrow({ where: { id: 1 } })
    ).toMatchObject({
      freeShippingThreshold: null,
      storeHours: "Open all week",
    })
  })

  it("S3: with the settings row there and the rates gone, only the rates are added", async () => {
    await seed()
    await db.shippingRate.deleteMany()
    await db.storeSettings.update({
      where: { id: 1 },
      data: { storeInfo: "Changed by Admin" },
    })

    const counts = await seed()

    expect(counts).toMatchObject({ shippingRates: 20, settingsCreated: false })
    expect(await db.shippingRate.count()).toBe(20)
    expect(
      (await db.storeSettings.findUniqueOrThrow({ where: { id: 1 } })).storeInfo
    ).toBe("Changed by Admin")
  })

  it("S3: with rates there and no settings row, only the row is created", async () => {
    await seed()
    await db.storeSettings.deleteMany()
    await db.shippingRate.update({
      where: {
        id: (await db.shippingRate.findFirstOrThrow({ select: { id: true } }))
          .id,
      },
      data: { fee: 99 },
    })

    const counts = await seed()

    expect(counts).toMatchObject({ shippingRates: 0, settingsCreated: true })
    expect(await db.shippingRate.count()).toBe(20)
    expect(await db.shippingRate.count({ where: { fee: 99 } })).toBe(1)
  })

  it("S4: a reset empties both tables and refills the demo values", async () => {
    await seed()
    await db.shippingRate.deleteMany({ where: { zone: "MINDANAO" } })
    await db.storeSettings.update({
      where: { id: 1 },
      data: { pickupEnabled: false, orderExpiryHours: 48 },
    })

    const counts = await seed(true)

    expect(counts).toMatchObject({ shippingRates: 20, settingsCreated: true })
    expect(await db.shippingRate.count()).toBe(20)
    expect(
      await db.storeSettings.findUniqueOrThrow({ where: { id: 1 } })
    ).toMatchObject({ pickupEnabled: true, orderExpiryHours: 24 })
  })
})
