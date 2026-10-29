import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { shareBuild } from "@/lib/build-share"
import { sharedBuildView } from "@/lib/build-state/shared"
import { getSharedBuild } from "@/lib/shared-build"
import { formatPeso } from "@/lib/format"
import {
  insertCopies,
  insertParts,
  itemsWithIds,
  partsOfBuild,
} from "@/test-support/build-fixtures"
import { db, FIXTURE_TODAY, resetCatalog } from "@/test-support/db"
import { buildA, buildOf, seed } from "@/test-support/seed-parts"

// Reading a shared build (docs/specs/022-share-build, Shared page examples
// E24–E36): items with their parts as they are now, or as parts that are no
// longer sold.

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

// Build A in the database, shared; the link's slug and the seed ids' map
async function shareBuildA(overrides: Parameters<typeof insertParts>[1] = {}) {
  const ids = await insertParts(partsOfBuild(buildA()), overrides)
  const result = await shareBuild(itemsWithIds(buildA(), ids), {
    today: FIXTURE_TODAY,
  })
  if (!result.ok) throw new Error("setup")
  return { slug: result.slug, ids }
}

const read = (slug: string) => getSharedBuild(slug, FIXTURE_TODAY)

describe("getSharedBuild", () => {
  it("returns build A's 8 parts as available, with prices and stock (E24)", async () => {
    const { slug } = await shareBuildA({
      [seed.ryzen5_7600.id]: { price: 1_149_500 },
    })

    const snapshot = await read(slug)

    expect(snapshot?.slug).toBe(slug)
    expect(snapshot?.items).toHaveLength(8)
    expect(snapshot?.items.every((item) => item.state === "available")).toBe(
      true
    )
    const cpu = snapshot?.items.find((item) => item.slot === "cpu")
    expect(cpu).toMatchObject({
      state: "available",
      quantity: 1,
      data: {
        brand: "Fixture",
        effectivePrice: 1_149_500,
        stockStatus: "in-stock",
      },
    })
  })

  it("feeds the view the page shows (E24)", async () => {
    const { slug } = await shareBuildA()
    const view = sharedBuildView((await read(slug))!.items)
    expect(view.slots).toHaveLength(8)
    expect(view.status).toBe("ok")
    expect(formatPeso(view.total)).toBe("₱8,000.00")
  })

  it("reads the price as it is now, not as it was when shared (E31)", async () => {
    const { slug, ids } = await shareBuildA()
    const before = sharedBuildView((await read(slug))!.items).total

    await db.product.update({
      where: { id: ids.get(seed.pro990.id)! },
      data: { price: 250_000 },
    })

    const after = sharedBuildView((await read(slug))!.items).total
    expect(after - before).toBe(150_000)
  })

  it("reads stock status as it is now (E26, E27)", async () => {
    const { slug, ids } = await shareBuildA()
    await db.product.update({
      where: { id: ids.get(seed.rtx4060.id)! },
      data: { stock: 0 },
    })
    await db.product.update({
      where: { id: ids.get(seed.pro990.id)! },
      data: { preorderShipsOn: new Date("2027-02-01") },
    })

    const items = (await read(slug))!.items
    const status = (slot: string) => {
      const item = items.find((entry) => entry.slot === slot)
      return item?.state === "available" ? item.data.stockStatus : item?.state
    }
    expect(status("gpu")).toBe("out-of-stock")
    expect(status("storage")).toBe("pre-order")
    expect(status("cpu")).toBe("in-stock")
  })

  it("lists a part that is no longer active as no longer sold, with only its name and brand (E28)", async () => {
    const { slug, ids } = await shareBuildA()
    await db.product.update({
      where: { id: ids.get(seed.rtx4060.id)! },
      data: { status: "DRAFT", price: 1, description: "secret draft" },
    })

    const snapshot = await read(slug)
    const gpu = snapshot!.items.find((item) => item.slot === "gpu")

    expect(gpu).toEqual({
      slot: "gpu",
      quantity: 1,
      state: "retired",
      id: ids.get(seed.rtx4060.id),
      name: seed.rtx4060.name,
      brand: "Fixture",
    })
    expect(JSON.stringify(gpu)).not.toContain("secret")
    expect(
      snapshot!.items.filter((item) => item.state === "retired")
    ).toHaveLength(1)
  })

  it("counts the parts of a draft in neither the total nor the checks (E28)", async () => {
    const { slug, ids } = await shareBuildA()
    const full = sharedBuildView((await read(slug))!.items)
    await db.product.update({
      where: { id: ids.get(seed.rtx4060.id)! },
      data: { status: "DRAFT" },
    })

    const view = sharedBuildView((await read(slug))!.items)

    expect(view.total).toBe(full.total - 100_000)
    expect(view.status).toBe("incomplete")
    expect(view.banner).toBe(
      "1 part is no longer sold, so the total and checks leave it out."
    )
  })

  it("treats a part whose specs no longer validate as no longer sold (E29)", async () => {
    const { slug, ids } = await shareBuildA()
    await db.product.update({
      where: { id: ids.get(seed.rtx4060.id)! },
      data: { specs: { broken: true } },
    })
    const errors = console.error
    console.error = () => {}

    const gpu = (await read(slug))!.items.find((item) => item.slot === "gpu")

    console.error = errors
    expect(gpu).toMatchObject({ state: "retired", name: seed.rtx4060.name })
  })

  it("keeps quantities (E32)", async () => {
    const ids = await insertParts([seed.vengeanceDdr5])
    const shared = await shareBuild(
      [
        {
          slot: "memory",
          productId: ids.get(seed.vengeanceDdr5.id)!,
          quantity: 2,
        },
      ],
      { today: FIXTURE_TODAY }
    )
    if (!shared.ok) throw new Error("setup")

    const snapshot = await read(shared.slug)

    expect(snapshot?.items).toMatchObject([{ slot: "memory", quantity: 2 }])
  })

  it("returns every drive of a build with many (E33)", async () => {
    const others = partsOfBuild(buildA()).filter(
      (part) => part.category !== "storage"
    )
    const ids = await insertParts(others)
    const drives = await insertCopies(seed.pro990, 3)
    const shared = await shareBuild(
      [
        ...itemsWithIds(buildOf(...others), ids),
        ...drives.map((productId) => ({
          slot: "storage" as const,
          productId,
          quantity: 1,
        })),
      ],
      { today: FIXTURE_TODAY }
    )
    if (!shared.ok) throw new Error("setup")

    const snapshot = await read(shared.slug)

    expect(
      snapshot?.items.filter((item) => item.slot === "storage")
    ).toHaveLength(3)
  })

  it("is null for a slug no build has (E34)", async () => {
    await shareBuildA()
    expect(await read("zzzzzzzzzz")).toBeNull()
  })

  it("is null for a build with no items (E36)", async () => {
    await db.build.create({
      data: { shareSlug: "emptybuild0", contentHash: "e".repeat(64) },
    })
    expect(await read("emptybuild0")).toBeNull()
  })
})
