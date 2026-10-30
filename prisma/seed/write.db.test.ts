import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { shareBuild } from "@/lib/build-share"
import { db, FIXTURE_TODAY, resetCatalog } from "@/test-support/db"
import { itemsWithIds, partsOfBuild } from "@/test-support/build-fixtures"
import { buildA } from "@/test-support/seed-parts"

import { seedFiles } from "./data"
import { shippingSeed } from "./data/shipping"
import { validateSeed } from "./validate"
import { writeSeed } from "./write"

// Shared builds and the seed (docs/specs/022-share-build, Rules › Production
// safety, E23, E70). A normal re-seed must keep builds; a reset empties them.
// Writes the whole validated seed to the test database.

const validation = validateSeed(seedFiles)
if (!validation.ok) throw new Error("the seed data is invalid")
const files = validation.files

afterAll(() => db.$disconnect())

// Build A's items, with the seeded products' database ids
async function buildAItems() {
  const skus = partsOfBuild(buildA()).map((part) => part.id)
  const rows = await db.product.findMany({
    where: { sku: { in: skus } },
    select: { id: true, sku: true },
  })
  expect(rows).toHaveLength(skus.length)
  return itemsWithIds(buildA(), new Map(rows.map((row) => [row.sku, row.id])))
}

const snapshotOf = async () => ({
  builds: await db.build.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      shareSlug: true,
      contentHash: true,
      createdAt: true,
    },
  }),
  items: await db.buildItem.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      buildId: true,
      slot: true,
      productId: true,
      quantity: true,
    },
  }),
})

describe("a re-seed (reset: false)", () => {
  beforeAll(async () => {
    await resetCatalog()
    await writeSeed(db, files, { reset: false, shipping: shippingSeed })
  }, 180_000)

  it("keeps shared builds and the products they point at (E70)", async () => {
    const items = await buildAItems()
    const shared = await shareBuild(items, { today: FIXTURE_TODAY })
    expect(shared).toMatchObject({ ok: true })
    const before = await snapshotOf()
    const productIds = (
      await db.product.findMany({
        orderBy: { sku: "asc" },
        select: { id: true },
      })
    ).map((row) => row.id)
    expect(before.builds).toHaveLength(1)
    expect(before.items).toHaveLength(8)

    await writeSeed(db, files, { reset: false, shipping: shippingSeed })
    await writeSeed(db, files, { reset: false, shipping: shippingSeed })

    expect(await snapshotOf()).toEqual(before)
    expect(
      (
        await db.product.findMany({
          orderBy: { sku: "asc" },
          select: { id: true },
        })
      ).map((row) => row.id)
    ).toEqual(productIds)
    // The link still resolves to the same items
    expect(await shareBuild(items, { today: FIXTURE_TODAY })).toEqual(shared)
  }, 180_000)
})

describe("a reset (reset: true)", () => {
  it("empties shared builds along with the catalog (E23)", async () => {
    await resetCatalog()
    await writeSeed(db, files, { reset: false, shipping: shippingSeed })
    await shareBuild(await buildAItems(), { today: FIXTURE_TODAY })
    expect(await db.build.count()).toBe(1)

    await writeSeed(db, files, { reset: true, shipping: shippingSeed })

    expect(await db.build.count()).toBe(0)
    expect(await db.buildItem.count()).toBe(0)
    expect(await db.product.count()).toBeGreaterThan(100)
  }, 180_000)
})
