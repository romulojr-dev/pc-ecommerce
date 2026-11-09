import { afterAll, beforeEach, describe, expect, test } from "vitest"

import { insertParts } from "@/test-support/build-fixtures"
import { db, resetCatalog } from "@/test-support/db"
import { seed } from "@/test-support/seed-parts"
import type { ImageStorage } from "@/lib/images/storage"

import { removeProductImage, reorderProductImages, setImageAlt } from "./manage"

// Reordering, alt text and removing photos (docs/specs/049-product-images-
// upload, B10–B12, R6–R10, E19–E29)

const BASE = "https://abc123.public.blob.vercel-storage.com/products"
let actor: { id: string; name: string; role: "owner" }
let productId: string
let a: string, b: string, c: string

async function photo(name: string, sortOrder: number, forProduct = productId) {
  const row = await db.productImage.create({
    data: {
      productId: forProduct,
      url: `${BASE}/${name}.webp`,
      alt: `Photo ${name}`,
      sortOrder,
    },
  })
  return row.id
}

const order = async (forProduct = productId) =>
  (
    await db.productImage.findMany({
      where: { productId: forProduct },
      orderBy: { sortOrder: "asc" },
    })
  ).map((row) => row.id)

const sortOrders = async (forProduct = productId) =>
  (
    await db.productImage.findMany({
      where: { productId: forProduct },
      orderBy: { sortOrder: "asc" },
    })
  ).map((row) => row.sortOrder)

const audit = () =>
  db.auditLog.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] })

beforeEach(async () => {
  await resetCatalog()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
  const user = await db.user.create({
    data: {
      email: "owner@example.com",
      name: "Owner",
      emailVerified: true,
      role: "OWNER",
    },
  })
  actor = { id: user.id, name: user.name, role: "owner" }
  productId = (await insertParts([seed.ryzen5_7600])).get(seed.ryzen5_7600.id)!
  a = await photo("a", 0)
  b = await photo("b", 1)
  c = await photo("c", 2)
})
afterAll(() => db.$disconnect())

describe("reorderProductImages", () => {
  test("E19: make main image: C first, the others keep their order behind it", async () => {
    const result = await reorderProductImages(actor, {
      productId,
      order: [c, a, b],
    })
    expect(result).toEqual({ kind: "saved", order: [c, a, b] })
    expect(await order()).toEqual([c, a, b])
    expect(await sortOrders()).toEqual([0, 1, 2])
    const rows = await audit()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      entity: "product",
      entityId: productId,
      action: "images-reordered",
      actorId: actor.id,
      before: { photoOrder: [a, b, c].join(",") },
      after: { photoOrder: [c, a, b].join(",") },
    })
  })

  test("E20: move down swaps with the neighbour", async () => {
    await reorderProductImages(actor, { productId, order: [b, a, c] })
    expect(await order()).toEqual([b, a, c])
  })

  test("the order it already has is unchanged: no write, no audit row", async () => {
    expect(
      await reorderProductImages(actor, { productId, order: [a, b, c] })
    ).toEqual({ kind: "unchanged" })
    expect(await audit()).toHaveLength(0)
  })

  test("E21: a screen that missed a removal is stale and writes nothing", async () => {
    await db.productImage.delete({ where: { id: b } })
    const result = await reorderProductImages(actor, {
      productId,
      order: [c, a, b],
    })
    expect(result).toEqual({ kind: "stale" })
    expect(await order()).toEqual([a, c])
    expect(await audit()).toHaveLength(0)
  })

  test("E29: a photo of another product in the list is stale", async () => {
    const other = (await insertParts([seed.ryzen7_9800x3d])).get(
      seed.ryzen7_9800x3d.id
    )!
    const foreign = await photo("x", 0, other)
    expect(
      await reorderProductImages(actor, { productId, order: [a, b, foreign] })
    ).toEqual({ kind: "stale" })
    expect(await order(other)).toEqual([foreign])
  })

  test("a list with a repeated photo in place of another is stale", async () => {
    expect(
      await reorderProductImages(actor, { productId, order: [a, a, b] })
    ).toEqual({ kind: "stale" })
    expect(await sortOrders()).toEqual([0, 1, 2])
    expect(await audit()).toHaveLength(0)
  })

  test("an unknown product is not found", async () => {
    expect(
      await reorderProductImages(actor, {
        productId: "zzzzzzzzzzzzzzzzzzzzzzzzz",
        order: [a],
      })
    ).toEqual({ kind: "not-found" })
  })

  test("the product's editVersion and updatedAt are untouched (D13)", async () => {
    const before = await db.product.findUniqueOrThrow({
      where: { id: productId },
    })
    await reorderProductImages(actor, { productId, order: [c, b, a] })
    const after = await db.product.findUniqueOrThrow({
      where: { id: productId },
    })
    expect(after.editVersion).toBe(before.editVersion)
    expect(after.updatedAt).toEqual(before.updatedAt)
  })
})

describe("setImageAlt", () => {
  test("E22: saves the trimmed text and audits the change", async () => {
    const result = await setImageAlt(actor, {
      imageId: a,
      alt: "  AMD Ryzen 5 7600 in its retail box  ",
    })
    expect(result).toEqual({
      kind: "saved",
      alt: "AMD Ryzen 5 7600 in its retail box",
    })
    expect(
      (await db.productImage.findUniqueOrThrow({ where: { id: a } })).alt
    ).toBe("AMD Ryzen 5 7600 in its retail box")
    const rows = await audit()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      action: "image-alt-changed",
      entityId: productId,
      before: { imageId: a, alt: "Photo a" },
      after: { imageId: a, alt: "AMD Ryzen 5 7600 in its retail box" },
    })
  })

  test("E23: blank text is invalid and writes nothing", async () => {
    expect(await setImageAlt(actor, { imageId: a, alt: "   " })).toEqual({
      kind: "invalid",
      error: "empty",
    })
    expect(await audit()).toHaveLength(0)
  })

  test("E24: 201 characters is invalid, 200 is saved", async () => {
    expect(
      await setImageAlt(actor, { imageId: a, alt: "x".repeat(201) })
    ).toEqual({ kind: "invalid", error: "too-long" })
    expect(
      (await setImageAlt(actor, { imageId: a, alt: "x".repeat(200) })).kind
    ).toBe("saved")
  })

  test("the same text is unchanged: no audit row", async () => {
    expect(await setImageAlt(actor, { imageId: a, alt: "Photo a" })).toEqual({
      kind: "unchanged",
      alt: "Photo a",
    })
    expect(await audit()).toHaveLength(0)
  })

  test("a removed photo is not found, even for an unrelated list change", async () => {
    await db.productImage.delete({ where: { id: a } })
    expect(await setImageAlt(actor, { imageId: a, alt: "New" })).toEqual({
      kind: "not-found",
    })
  })

  test("other photos changing does not make an alt save stale", async () => {
    await db.productImage.delete({ where: { id: c } })
    expect((await setImageAlt(actor, { imageId: a, alt: "New" })).kind).toBe(
      "saved"
    )
  })
})

function storageSpy(result: "deleted" | "failed" = "deleted") {
  const seen: { url: string; rowGone: boolean }[] = []
  const storage: ImageStorage = {
    put: async () => ({ ok: false, code: "unused" }),
    delete: async (url) => {
      // At this moment the transaction must already have committed
      const rowGone = (await db.productImage.count({ where: { url } })) === 0
      seen.push({ url, rowGone })
      return result
    },
  }
  return { storage, seen }
}

describe("removeProductImage", () => {
  test("E25: removes the photo, renumbers the rest, audits, and deletes the file after the commit", async () => {
    const { storage, seen } = storageSpy()
    const result = await removeProductImage(
      actor,
      { productId, imageId: b, shown: [a, b, c] },
      { storage }
    )
    expect(result).toEqual({
      kind: "removed",
      lastPhoto: false,
      deleted: "deleted",
    })
    expect(await order()).toEqual([a, c])
    expect(await sortOrders()).toEqual([0, 1])
    expect(seen).toEqual([{ url: `${BASE}/b.webp`, rowGone: true }])
    const rows = await audit()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      action: "image-removed",
      before: {
        imageId: b,
        url: `${BASE}/b.webp`,
        alt: "Photo b",
        position: 1,
      },
    })
  })

  test("removing the main image makes the next one main", async () => {
    await removeProductImage(
      actor,
      { productId, imageId: a, shown: [a, b, c] },
      { storage: storageSpy().storage }
    )
    expect(await order()).toEqual([b, c])
    expect(await sortOrders()).toEqual([0, 1])
  })

  test("E26: the last photo says so, and the placeholder is back", async () => {
    await db.productImage.deleteMany({ where: { id: { in: [b, c] } } })
    const result = await removeProductImage(
      actor,
      { productId, imageId: a, shown: [a] },
      { storage: storageSpy().storage }
    )
    expect(result).toMatchObject({ kind: "removed", lastPhoto: true })
    expect(await db.productImage.count({ where: { productId } })).toBe(0)
  })

  test("E27: a failed file delete never fails the removal", async () => {
    const { storage } = storageSpy("failed")
    const result = await removeProductImage(
      actor,
      { productId, imageId: b, shown: [a, b, c] },
      { storage }
    )
    expect(result).toMatchObject({ kind: "removed", deleted: "failed" })
    expect(await order()).toEqual([a, c])
  })

  test("E21: a stale list removes nothing and deletes no file", async () => {
    const { storage, seen } = storageSpy()
    const result = await removeProductImage(
      actor,
      { productId, imageId: b, shown: [a, b] },
      { storage }
    )
    expect(result).toEqual({ kind: "stale" })
    expect(await order()).toEqual([a, b, c])
    expect(seen).toEqual([])
    expect(await audit()).toHaveLength(0)
  })

  test("E29: another product's photo is stale and stays", async () => {
    const other = (await insertParts([seed.ryzen7_9800x3d])).get(
      seed.ryzen7_9800x3d.id
    )!
    const foreign = await photo("x", 0, other)
    const result = await removeProductImage(
      actor,
      { productId, imageId: foreign, shown: [a, b, c] },
      { storage: storageSpy().storage }
    )
    expect(result).toEqual({ kind: "stale" })
    expect(await order(other)).toEqual([foreign])
  })

  test("a photo already removed in another tab is stale", async () => {
    await removeProductImage(
      actor,
      { productId, imageId: b, shown: [a, b, c] },
      { storage: storageSpy().storage }
    )
    const again = await removeProductImage(
      actor,
      { productId, imageId: b, shown: [a, b, c] },
      { storage: storageSpy().storage }
    )
    expect(again).toEqual({ kind: "stale" })
  })

  test("an unknown product is not found", async () => {
    expect(
      await removeProductImage(
        actor,
        { productId: "zzzzzzzzzzzzzzzzzzzzzzzzz", imageId: a, shown: [a] },
        { storage: storageSpy().storage }
      )
    ).toEqual({ kind: "not-found" })
  })
})

describe("concurrent writes to one product (R8)", () => {
  test("a removal and a reorder at once leave a dense, consistent order", async () => {
    const results = await Promise.all([
      removeProductImage(
        actor,
        { productId, imageId: a, shown: [a, b, c] },
        { storage: storageSpy().storage }
      ),
      reorderProductImages(actor, { productId, order: [c, b, a] }),
    ])
    expect(results.some((r) => r.kind === "removed")).toBe(true)
    const left = await order()
    expect(await sortOrders()).toEqual(left.map((_, i) => i))
    expect(left).not.toContain(a)
  })

  test("two removals of the same photo: one wins, the other is stale", async () => {
    const [x, y] = await Promise.all([
      removeProductImage(
        actor,
        { productId, imageId: b, shown: [a, b, c] },
        { storage: storageSpy().storage }
      ),
      removeProductImage(
        actor,
        { productId, imageId: b, shown: [a, b, c] },
        { storage: storageSpy().storage }
      ),
    ])
    expect([x.kind, y.kind].sort()).toEqual(["removed", "stale"])
    expect(await sortOrders()).toEqual([0, 1])
  })
})
