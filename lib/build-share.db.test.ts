import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { contentHashOf } from "@/lib/build-share-hash"
import { isShareSlug } from "@/lib/build-share-slug"
import { shareBuild } from "@/lib/build-share"
import { MAX_SHARE_QUANTITY } from "@/lib/build-state/share"
import { type Build, type BuildItem } from "@/lib/builder"
import { db, FIXTURE_TODAY, resetCatalog } from "@/test-support/db"
import {
  insertCopies,
  insertParts,
  itemsWithIds,
  partsOfBuild,
  UNKNOWN_PRODUCT_ID,
} from "@/test-support/build-fixtures"
import { buildA, buildOf, seed } from "@/test-support/seed-parts"

// Sharing a build (docs/specs/022-share-build, Sharing examples E1–E22, E61,
// E62): the same contents give the same row, whatever the order and however
// many requests arrive at once; bad input writes nothing.

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

const share = (items: unknown, options = {}) =>
  shareBuild(items, { today: FIXTURE_TODAY, ...options })

const counts = async () => ({
  builds: await db.build.count(),
  items: await db.buildItem.count(),
})

// Build A's parts (and any extra) in the database, with Build A's items
async function setupBuildA(extra: Parameters<typeof insertParts>[0] = []) {
  const parts = [...partsOfBuild(buildA()), ...extra]
  const ids = await insertParts(parts)
  return { ids, items: itemsWithIds(buildA(), ids) }
}

describe("shareBuild", () => {
  it("stores build A as one snapshot with its 8 items (E1)", async () => {
    const { items } = await setupBuildA()

    const result = await share(items)

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(isShareSlug(result.slug)).toBe(true)
    expect(await counts()).toEqual({ builds: 1, items: 8 })

    const build = await db.build.findUniqueOrThrow({
      where: { shareSlug: result.slug },
      include: { items: true },
    })
    expect(build.contentHash).toBe(contentHashOf(items))
    expect(build.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(
      build.items
        .map(({ slot, productId, quantity }) => ({ slot, productId, quantity }))
        .sort((a, b) => a.slot.localeCompare(b.slot))
    ).toEqual([...items].sort((a, b) => a.slot.localeCompare(b.slot)))
  })

  it("gives the same slug for the same contents (E2)", async () => {
    const { items } = await setupBuildA()
    const first = await share(items)
    const second = await share(items)

    expect(second).toEqual(first)
    expect(await counts()).toEqual({ builds: 1, items: 8 })
  })

  it("ignores the order the items come in (E3)", async () => {
    const { ids } = await setupBuildA([seed.mx500])
    const withTwoDrives = (build: Build) => itemsWithIds(build, ids)
    const forward = withTwoDrives({
      ...buildA(),
      storage: [
        { part: seed.pro990, quantity: 1 },
        { part: seed.mx500, quantity: 1 },
      ],
    })
    const backward = withTwoDrives({
      ...buildA(),
      storage: [
        { part: seed.mx500, quantity: 1 },
        { part: seed.pro990, quantity: 1 },
      ],
    })

    const first = await share(forward)
    const second = await share(backward)

    expect(first).toMatchObject({ ok: true })
    expect(second).toEqual(first)
    expect(await counts()).toEqual({ builds: 1, items: 9 })
  })

  it("makes a new snapshot when a quantity changes, and leaves the old one alone (E4)", async () => {
    const { items } = await setupBuildA()
    const original = await share(items)
    const doubled = await share(
      items.map((item) =>
        item.slot === "memory" ? { ...item, quantity: 2 } : item
      )
    )

    expect(original).toMatchObject({ ok: true })
    expect(doubled).toMatchObject({ ok: true })
    expect(doubled).not.toEqual(original)
    expect(await counts()).toEqual({ builds: 2, items: 16 })

    if (!original.ok) return
    const kept = await db.build.findUniqueOrThrow({
      where: { shareSlug: original.slug },
      include: { items: true },
    })
    expect(kept.items.find((item) => item.slot === "memory")?.quantity).toBe(1)
  })

  it("gives one slug to ten shares at the same moment (E5)", async () => {
    const { items } = await setupBuildA()

    const results = await Promise.all(
      Array.from({ length: 10 }, () => share(items))
    )

    expect(results.every((result) => result.ok)).toBe(true)
    expect(new Set(results.map((result) => JSON.stringify(result))).size).toBe(
      1
    )
    expect(await counts()).toEqual({ builds: 1, items: 8 })
  })

  it("gives two different builds at once two slugs (E5)", async () => {
    const { items } = await setupBuildA()
    const memory2 = items.map((item) =>
      item.slot === "memory" ? { ...item, quantity: 2 } : item
    )

    const [a, b] = await Promise.all([share(items), share(memory2)])

    expect(a).toMatchObject({ ok: true })
    expect(b).toMatchObject({ ok: true })
    expect(a).not.toEqual(b)
    expect(await counts()).toEqual({ builds: 2, items: 16 })
  })

  it("answers two parallel shares of new contents with one row (E61)", async () => {
    const { items } = await setupBuildA()

    const [first, second] = await Promise.all([share(items), share(items)])

    expect(first).toMatchObject({ ok: true })
    expect(second).toEqual(first)
    expect(await counts()).toEqual({ builds: 1, items: 8 })
    // The row is whole: nobody can have been handed a half-written snapshot
    const [build] = await db.build.findMany({ include: { items: true } })
    expect(build.items).toHaveLength(8)
  })

  it("retries a slug that another build already has (E62)", async () => {
    const { ids, items } = await setupBuildA([seed.mx500])
    const first = await share(items)
    if (!first.ok) throw new Error("setup")

    const other = itemsWithIds(
      { ...buildA(), storage: [{ part: seed.mx500, quantity: 1 }] },
      ids
    )
    const slugs = [first.slug, first.slug, "bbbbbbbbbb"]
    const result = await share(other, { newSlug: () => slugs.shift()! })

    expect(result).toEqual({ ok: true, slug: "bbbbbbbbbb" })
    expect(await db.build.count()).toBe(2)
  })

  it("gives up after three slug collisions and writes nothing (E62)", async () => {
    const { ids, items } = await setupBuildA([seed.mx500])
    const first = await share(items)
    if (!first.ok) throw new Error("setup")
    const other = itemsWithIds(
      { ...buildA(), storage: [{ part: seed.mx500, quantity: 1 }] },
      ids
    )
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await share(other, { newSlug: () => first.slug })

    expect(result).toEqual({ ok: false, reason: "error" })
    expect(await db.build.count()).toBe(1)
    errors.mockRestore()
  })

  it("shares a build that has errors (E6)", async () => {
    const parts = [seed.ryzen5_7600, seed.proB760mDdr4]
    const ids = await insertParts(parts)
    const items = itemsWithIds(buildOf(...parts), ids)

    expect(await share(items)).toMatchObject({ ok: true })
  })

  it("shares parts that are active but can't be bought now (E7)", async () => {
    const parts = [seed.ryzen7_9800x3d, seed.rtx5090Astral, seed.rm850e]
    const ids = await insertParts(parts, {
      [seed.rtx5090Astral.id]: { stock: 0 },
      [seed.ryzen7_9800x3d.id]: { preorderShipsOn: "2027-02-01" },
    })
    const items = itemsWithIds(buildOf(...parts), ids)

    expect(await share(items)).toMatchObject({ ok: true })
  })

  it("shares a single part (E8)", async () => {
    const ids = await insertParts([seed.ryzen5_7600])
    const result = await share(itemsWithIds(buildOf(seed.ryzen5_7600), ids))
    expect(result).toMatchObject({ ok: true })
    expect(await counts()).toEqual({ builds: 1, items: 1 })
  })

  it("shares 20 different products (E10)", async () => {
    // Build A's 7 other parts plus 13 different drives
    const others = partsOfBuild(buildA()).filter(
      (part) => part.category !== "storage"
    )
    const ids = await insertParts(others)
    const drives = await insertCopies(seed.pro990, 13)
    const items: BuildItem[] = [
      ...itemsWithIds(buildOf(...others), ids),
      ...drives.map((productId) => ({
        slot: "storage" as const,
        productId,
        quantity: 1,
      })),
    ]
    expect(items).toHaveLength(20)

    expect(await share(items)).toMatchObject({ ok: true })
    expect(await db.buildItem.count()).toBe(20)
  })

  it("stores the quantity limit (E14)", async () => {
    const ids = await insertParts([seed.vengeanceDdr5])
    const memory = (quantity: number) => [
      {
        slot: "memory",
        productId: ids.get(seed.vengeanceDdr5.id)!,
        quantity,
      },
    ]
    expect(await share(memory(MAX_SHARE_QUANTITY))).toMatchObject({ ok: true })
    expect(await share(memory(MAX_SHARE_QUANTITY + 1))).toMatchObject({
      ok: false,
      reason: "quantity-too-high",
    })
  })

  describe("writes nothing for input it rejects", () => {
    it.each([
      ["an empty build (E9)", []],
      ["a non-list (E12)", { slot: "cpu" }],
      [
        "an unknown slot (E12)",
        [{ slot: "monitor", productId: "a", quantity: 1 }],
      ],
      [
        "a quantity of 0 (E12)",
        [{ slot: "memory", productId: "a", quantity: 0 }],
      ],
    ])("%s", async (_name, input) => {
      await setupBuildA()
      const result = await share(input)
      expect(result.ok).toBe(false)
      expect(await counts()).toEqual({ builds: 0, items: 0 })
    })

    it("a repeated drive (E13)", async () => {
      const ids = await insertParts([seed.pro990])
      const id = ids.get(seed.pro990.id)!
      const result = await share([
        { slot: "storage", productId: id, quantity: 1 },
        { slot: "storage", productId: id, quantity: 1 },
      ])
      expect(result).toEqual({ ok: false, reason: "invalid" })
      expect(await counts()).toEqual({ builds: 0, items: 0 })
    })

    it("21 items, before any database read (E11)", async () => {
      const findMany = vi.spyOn(db.product, "findMany")
      const result = await share(
        Array.from({ length: 21 }, (_, index) => ({
          slot: "storage",
          productId: `drive${index}`,
          quantity: 1,
        }))
      )
      expect(result).toEqual({ ok: false, reason: "too-many-parts" })
      expect(findMany).not.toHaveBeenCalled()
      findMany.mockRestore()
    })

    it("a product no one has (E15)", async () => {
      const { items } = await setupBuildA()
      const result = await share([
        ...items.filter((item) => item.slot !== "gpu"),
        { slot: "gpu", productId: UNKNOWN_PRODUCT_ID, quantity: 1 },
      ])
      expect(result).toEqual({ ok: false, reason: "unavailable" })
      expect(await counts()).toEqual({ builds: 0, items: 0 })
    })

    it("a product that isn't active (E16)", async () => {
      const { ids, items } = await setupBuildA()
      await db.product.update({
        where: { id: ids.get(seed.rtx4060.id)! },
        data: { status: "DRAFT" },
      })
      expect(await share(items)).toEqual({
        ok: false,
        reason: "unavailable",
      })
      expect(await counts()).toEqual({ builds: 0, items: 0 })
    })

    it("a part in the wrong slot (E17)", async () => {
      const ids = await insertParts([seed.ryzen5_7600])
      const result = await share([
        {
          slot: "storage",
          productId: ids.get(seed.ryzen5_7600.id)!,
          quantity: 1,
        },
      ])
      expect(result).toEqual({ ok: false, reason: "unavailable" })
      expect(await counts()).toEqual({ builds: 0, items: 0 })
    })
  })

  it("computes the hash itself and ignores one it is sent (E18)", async () => {
    const { items } = await setupBuildA()
    const result = await share(
      items.map((item) => ({ ...item, contentHash: "forged" }))
    )
    expect(result).toMatchObject({ ok: true })
    const build = await db.build.findFirstOrThrow()
    expect(build.contentHash).toBe(contentHashOf(items))
  })

  it("answers error, not an exception, when the database fails (E19)", async () => {
    const { items } = await setupBuildA()
    const create = vi
      .spyOn(db, "$transaction")
      .mockRejectedValue(new Error("connection lost"))
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(await share(items)).toEqual({ ok: false, reason: "error" })

    create.mockRestore()
    errors.mockRestore()
  })
})

describe("the tables", () => {
  it("leaves no Build behind when one of its items fails (E19)", async () => {
    const ids = await insertParts([seed.ryzen5_7600])
    await expect(
      db.build.create({
        data: {
          shareSlug: "aaaaaaaaaa",
          contentHash: "h".repeat(64),
          items: {
            create: [
              {
                slot: "cpu",
                productId: ids.get(seed.ryzen5_7600.id)!,
                quantity: 1,
              },
              // Breaks the CHECK, so the whole create fails
              {
                slot: "cpu",
                productId: ids.get(seed.ryzen5_7600.id)!,
                quantity: 0,
              },
            ],
          },
        },
      })
    ).rejects.toThrow()
    expect(await counts()).toEqual({ builds: 0, items: 0 })
  })

  it("refuses to delete a product that a build uses (E20)", async () => {
    const { ids, items } = await setupBuildA()
    await share(items)
    const ryzen = ids.get(seed.ryzen5_7600.id)!

    await expect(db.product.delete({ where: { id: ryzen } })).rejects.toThrow()

    expect(await db.product.count({ where: { id: ryzen } })).toBe(1)
    expect(await counts()).toEqual({ builds: 1, items: 8 })
  })

  it("deletes a product no build uses (E21)", async () => {
    const { items } = await setupBuildA()
    await share(items)
    const [unused] = await insertCopies(seed.ryzen5_7600, 1)

    await db.product.delete({ where: { id: unused } })

    expect(await db.product.count({ where: { id: unused } })).toBe(0)
    expect(await counts()).toEqual({ builds: 1, items: 8 })
  })

  it("refuses a second item with the same build, slot and product (E22)", async () => {
    const { items } = await setupBuildA()
    await share(items)
    const existing = await db.buildItem.findFirstOrThrow()

    await expect(
      db.buildItem.create({
        data: {
          buildId: existing.buildId,
          slot: existing.slot,
          productId: existing.productId,
          quantity: 1,
        },
      })
    ).rejects.toThrow()
  })

  it("refuses an item with no units", async () => {
    const { items } = await setupBuildA()
    await share(items)
    const existing = await db.buildItem.findFirstOrThrow()
    const [other] = await insertCopies(seed.pro990, 1)

    await expect(
      db.buildItem.create({
        data: {
          buildId: existing.buildId,
          slot: "storage",
          productId: other,
          quantity: 0,
        },
      })
    ).rejects.toThrow()
  })
})
