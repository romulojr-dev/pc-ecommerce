import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"

import { shareBuild } from "@/lib/build-share"
import { ResetRefusedError } from "@/lib/reset-guard"
import { buildA } from "@/test-support/seed-parts"

import { insertParts, itemsWithIds, partsOfBuild } from "./build-fixtures"
import { db, FIXTURE_TODAY, resetCatalog } from "./db"

// resetCatalog() and the production guard (docs/specs/022-share-build, E23,
// E69)

const saved = {
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
  PRODUCTION_DATABASE_HOST: process.env.PRODUCTION_DATABASE_HOST,
}

function restore() {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}

beforeEach(async () => {
  restore()
  await resetCatalog()
  const ids = await insertParts(partsOfBuild(buildA()))
  await shareBuild(itemsWithIds(buildA(), ids), { today: FIXTURE_TODAY })
})

afterEach(restore)
afterAll(() => db.$disconnect())

const counts = async () => ({
  builds: await db.build.count(),
  items: await db.buildItem.count(),
  products: await db.product.count(),
})

describe("resetCatalog", () => {
  it("empties shared builds with the catalog (E23)", async () => {
    expect(await counts()).toEqual({ builds: 1, items: 8, products: 8 })

    await resetCatalog()

    expect(await counts()).toEqual({ builds: 0, items: 0, products: 0 })
  })

  it("empties the shipping rates and the store settings too (spec 028, S4)", async () => {
    await db.shippingRate.create({
      data: { zone: "LUZON", maxWeightGrams: 1_000, fee: 100 },
    })
    await db.storeSettings.create({
      data: { storeAddress: "a", storeHours: "b", storeInfo: "c" },
    })

    await resetCatalog()

    expect(await db.shippingRate.count()).toBe(0)
    expect(await db.storeSettings.count()).toBe(0)
  })

  it("refuses when VERCEL_ENV is production, before deleting anything (E69)", async () => {
    process.env.VERCEL_ENV = "production"

    await expect(resetCatalog()).rejects.toBeInstanceOf(ResetRefusedError)
    await expect(resetCatalog()).rejects.toThrow(/VERCEL_ENV is production/)

    process.env.VERCEL_ENV = ""
    expect(await counts()).toEqual({ builds: 1, items: 8, products: 8 })
  })

  it("refuses when DATABASE_URL is on the production host (E69)", async () => {
    const url = new URL(process.env.DATABASE_URL!)
    process.env.PRODUCTION_DATABASE_HOST = url.hostname

    await expect(resetCatalog()).rejects.toThrow(/is the production database/)

    delete process.env.PRODUCTION_DATABASE_HOST
    expect(await counts()).toEqual({ builds: 1, items: 8, products: 8 })
  })
})
