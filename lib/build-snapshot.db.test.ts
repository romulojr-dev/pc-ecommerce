import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { contentHashOf } from "@/lib/build-share-hash"
import { SnapshotSlugError, upsertBuildSnapshot } from "@/lib/build-snapshot"
import type { BuildItem } from "@/lib/builder"
import { db, resetCatalog } from "@/test-support/db"
import {
  insertParts,
  itemsWithIds,
  partsOfBuild,
} from "@/test-support/build-fixtures"
import { buildA, seed } from "@/test-support/seed-parts"

// The snapshot write both sharing and Add build to cart use (docs/specs/026-
// add-build-to-cart, D5, Rules › Concurrency): it never raises a conflict
// inside a transaction, because Postgres would abort the transaction.

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

// Build A's items, and a second build that swaps its SSD for the MX500
async function setup() {
  const ids = await insertParts([...partsOfBuild(buildA()), seed.mx500])
  return {
    items: itemsWithIds(buildA(), ids),
    other: itemsWithIds(
      { ...buildA(), storage: [{ part: seed.mx500, quantity: 1 }] },
      ids
    ),
  }
}

const write = (items: BuildItem[], newSlug?: () => string) =>
  db.$transaction((tx) => upsertBuildSnapshot(tx, items, { newSlug }))

describe("upsertBuildSnapshot", () => {
  it("creates the build with its 8 items once", async () => {
    const { items } = await setup()

    const first = await write(items)
    const again = await write(items)

    expect(first.created).toBe(true)
    expect(again).toEqual({ ...first, created: false })
    expect(await db.build.count()).toBe(1)
    expect(await db.buildItem.count()).toBe(8)
    expect((await db.build.findFirstOrThrow()).contentHash).toBe(
      contentHashOf(items)
    )
  })

  it("retries a slug another build has, in the same healthy transaction", async () => {
    const { items, other } = await setup()
    const first = await write(items)

    const slugs = [first.shareSlug, "bbbbbbbbbb"]
    const second = await write(other, () => slugs.shift()!)

    expect(second).toMatchObject({ shareSlug: "bbbbbbbbbb", created: true })
    expect(await db.build.count()).toBe(2)
    expect(await db.buildItem.count()).toBe(16)
  })

  it("gives up after three slug collisions", async () => {
    const { items, other } = await setup()
    const first = await write(items)

    await expect(write(other, () => first.shareSlug)).rejects.toThrow(
      SnapshotSlugError
    )
    expect(await db.build.count()).toBe(1)
  })

  it("leaves no row when the outer transaction rolls back", async () => {
    const { items } = await setup()

    await expect(
      db.$transaction(async (tx) => {
        await upsertBuildSnapshot(tx, items)
        throw new Error("the cart write failed")
      })
    ).rejects.toThrow("the cart write failed")

    expect(await db.build.count()).toBe(0)
    expect(await db.buildItem.count()).toBe(0)
  })

  it("lets the transaction go on after reusing a build", async () => {
    const { items } = await setup()
    await write(items)

    const count = await db.$transaction(async (tx) => {
      await upsertBuildSnapshot(tx, items)
      return tx.build.count()
    })

    expect(count).toBe(1)
  })

  it("gives parallel writes of new contents one row and no error", async () => {
    const { items } = await setup()

    const results = await Promise.all(
      Array.from({ length: 8 }, () => write(items))
    )

    expect(new Set(results.map((r) => r.id)).size).toBe(1)
    expect(results.filter((r) => r.created)).toHaveLength(1)
    expect(await db.build.count()).toBe(1)
    expect(await db.buildItem.count()).toBe(8)
  })
})
