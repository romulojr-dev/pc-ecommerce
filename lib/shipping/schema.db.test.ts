import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { db, resetCatalog } from "@/test-support/db"

// The tables' constraints (docs/specs/028-shipping-data-and-fee-rules, S5,
// S6). The partial unique index is declared in schema.prisma; the CHECKs are
// migration-only, so only these tests cover them (db:drift doesn't compare
// CHECKs).

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

const settingsRow = {
  storeAddress: "a",
  storeHours: "b",
  storeInfo: "c",
}

const tier = (maxWeightGrams: number | null, fee = 100) => ({
  zone: "LUZON" as const,
  maxWeightGrams,
  fee,
})

describe("StoreSettings", () => {
  it("S5: holds one row, with id 1 and the defaults", async () => {
    const row = await db.storeSettings.create({ data: settingsRow })
    expect(row).toMatchObject({
      id: 1,
      freeShippingThreshold: null,
      pickupEnabled: true,
      orderExpiryHours: 24,
    })
  })

  it("S5: refuses a second row", async () => {
    await db.storeSettings.create({ data: settingsRow })
    await expect(
      db.storeSettings.create({ data: { ...settingsRow, id: 2 } })
    ).rejects.toThrow()
    await expect(
      db.storeSettings.create({ data: settingsRow })
    ).rejects.toThrow()
    expect(await db.storeSettings.count()).toBe(1)
  })

  it.each([
    ["a threshold of 0", { freeShippingThreshold: 0 }],
    ["a negative threshold", { freeShippingThreshold: -1 }],
    ["an expiry of 0 hours", { orderExpiryHours: 0 }],
  ])("S6: refuses %s", async (_name, patch) => {
    await expect(
      db.storeSettings.create({ data: { ...settingsRow, ...patch } })
    ).rejects.toThrow()
    expect(await db.storeSettings.count()).toBe(0)
  })

  it("accepts a null threshold (free shipping off)", async () => {
    await db.storeSettings.create({
      data: { ...settingsRow, freeShippingThreshold: null },
    })
    expect(await db.storeSettings.count()).toBe(1)
  })
})

describe("ShippingRate", () => {
  it("accepts a zone's bounded tiers and one open-ended tier", async () => {
    await db.shippingRate.createMany({
      data: [tier(1_000), tier(3_000), tier(null, 500)],
    })
    expect(await db.shippingRate.count()).toBe(3)
  })

  it("S6: refuses a second open-ended tier in a zone, but not in another", async () => {
    await db.shippingRate.create({ data: tier(null) })
    await expect(db.shippingRate.create({ data: tier(null) })).rejects.toThrow()
    await db.shippingRate.create({
      data: { zone: "VISAYAS", maxWeightGrams: null, fee: 100 },
    })
    expect(await db.shippingRate.count()).toBe(2)
  })

  it("S6: refuses the same limit twice in a zone", async () => {
    await db.shippingRate.create({ data: tier(1_000) })
    await expect(
      db.shippingRate.create({ data: tier(1_000) })
    ).rejects.toThrow()
  })

  it.each([
    ["a limit of 0", tier(0)],
    ["a negative limit", tier(-5)],
    ["a negative fee", tier(1_000, -1)],
  ])("S6: refuses %s", async (_name, data) => {
    await expect(db.shippingRate.create({ data })).rejects.toThrow()
    expect(await db.shippingRate.count()).toBe(0)
  })

  it("allows a fee of 0 (a free tier)", async () => {
    await db.shippingRate.create({ data: tier(1_000, 0) })
    expect(await db.shippingRate.count()).toBe(1)
  })

  it("has both unique indexes after the migrations", async () => {
    const rows = await db.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'ShippingRate' ORDER BY indexname`
    const byName = Object.fromEntries(
      rows.map((r) => [r.indexname, r.indexdef])
    )
    expect(byName["ShippingRate_zone_maxWeightGrams_key"]).toMatch(/UNIQUE/)
    expect(byName["ShippingRate_zone_key"]).toMatch(/UNIQUE.*WHERE/)
  })
})
