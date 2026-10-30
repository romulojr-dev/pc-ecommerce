import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { shippingSeed } from "@/prisma/seed/data/shipping"
import { writeSeed } from "@/prisma/seed/write"
import { db, resetCatalog } from "@/test-support/db"

import { getShippingConfig } from "./config"
import { shippingFee } from "./fee"

// getShippingConfig (docs/specs/028-shipping-data-and-fee-rules, D16)

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

describe("getShippingConfig", () => {
  it("maps the rows to zone strings, ordered by zone and limit with the open-ended tier last", async () => {
    await writeSeed(db, [], { reset: false, shipping: shippingSeed })

    const { rates, settings } = await getShippingConfig()

    expect(rates).toHaveLength(20)
    const luzon = rates.filter((r) => r.zone === "luzon")
    expect(luzon.map((r) => r.maxWeightGrams)).toEqual([
      1_000,
      3_000,
      10_000,
      20_000,
      null,
    ])
    expect(new Set(rates.map((r) => r.zone))).toEqual(
      new Set(["metro-manila", "luzon", "visayas", "mindanao"])
    )
    expect(settings).toEqual(shippingSeed.store)
  })

  it("feeds shippingFee: Build A to Metro Manila costs ₱450", async () => {
    await writeSeed(db, [], { reset: false, shipping: shippingSeed })
    const { rates, settings } = await getShippingConfig()

    expect(
      shippingFee(
        {
          method: "delivery",
          zone: "metro-manila",
          weightGrams: 15_860,
          subtotal: 6_906_000,
        },
        rates,
        settings
      )
    ).toEqual({ ok: true, fee: 45_000, basis: "rate" })
  })

  it("returns no rates when the table is empty, and every zone is then no-rate", async () => {
    await db.storeSettings.create({ data: { ...shippingSeed.store, id: 1 } })

    const { rates, settings } = await getShippingConfig()

    expect(rates).toEqual([])
    expect(
      shippingFee(
        {
          method: "delivery",
          zone: "luzon",
          weightGrams: 450,
          subtotal: 1_149_500,
        },
        rates,
        settings
      )
    ).toEqual({ ok: false, reason: "no-rate" })
  })

  it("throws when the settings row is missing (a setup error)", async () => {
    await expect(getShippingConfig()).rejects.toThrow(/Run `pnpm db:seed`/)
  })
})
