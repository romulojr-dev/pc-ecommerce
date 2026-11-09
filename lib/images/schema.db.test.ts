import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { db, resetCatalog } from "@/test-support/db"
import { insertParts } from "@/test-support/build-fixtures"
import { seed } from "@/test-support/seed-parts"

// The photo tables (docs/specs/049-product-images-upload, §6 Schema, E37,
// R7, R8). The CHECKs are migration-only (db:drift doesn't compare them), so
// only these tests cover them.

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

const BLOB_URL = "https://abc123.public.blob.vercel-storage.com/products/x.webp"

async function ryzen() {
  const ids = await insertParts([seed.ryzen5_7600])
  return ids.get(seed.ryzen5_7600.id)!
}

describe("ProductImage constraints", () => {
  it("R7: alt text of 1 to 200 characters is stored", async () => {
    const productId = await ryzen()
    for (const alt of ["a", "x".repeat(200)]) {
      await db.productImage.create({
        data: { productId, url: BLOB_URL, alt, sortOrder: 0 },
      })
    }
    expect(await db.productImage.count()).toBe(2)
  })

  it("R7: blank, whitespace-only and 201-character alt text are refused", async () => {
    const productId = await ryzen()
    for (const alt of ["", "   ", "x".repeat(201)]) {
      await expect(
        db.productImage.create({
          data: { productId, url: BLOB_URL, alt, sortOrder: 0 },
        })
      ).rejects.toThrow()
    }
    expect(await db.productImage.count()).toBe(0)
  })

  it("R8: a negative sortOrder is refused", async () => {
    const productId = await ryzen()
    await expect(
      db.productImage.create({
        data: { productId, url: BLOB_URL, alt: "a", sortOrder: -1 },
      })
    ).rejects.toThrow()
  })

  it("R8: two images may share a sortOrder (the index is not unique)", async () => {
    // So a renumbering is a plain UPDATE under the product row lock
    const productId = await ryzen()
    for (const url of [BLOB_URL, BLOB_URL + "2"]) {
      await db.productImage.create({
        data: { productId, url, alt: "a", sortOrder: 0 },
      })
    }
    expect(await db.productImage.count()).toBe(2)
  })

  it("a new row has a createdAt", async () => {
    const productId = await ryzen()
    const row = await db.productImage.create({
      data: { productId, url: BLOB_URL, alt: "a", sortOrder: 0 },
    })
    expect(row.createdAt).toBeInstanceOf(Date)
  })

  it("images go with their product (cascade), the product stays without them", async () => {
    const productId = await ryzen()
    await db.productImage.create({
      data: { productId, url: BLOB_URL, alt: "a", sortOrder: 0 },
    })
    await db.productImage.deleteMany({ where: { productId } })
    expect(await db.product.count()).toBe(1)
  })
})

// The migration's first statement, run against rows made the way the old seed
// made them (E37). Taken from the file, so the test can't drift from it.
function placeholderDeletion(): string {
  const sql = readFileSync(
    join(
      process.cwd(),
      "prisma",
      "migrations",
      "20261111090000_product_image_storage",
      "migration.sql"
    ),
    "utf8"
  )
  const match = /DO \$\$[\s\S]*?\n\$\$;?/.exec(sql)
  if (!match) throw new Error("the migration has no DO block")
  return match[0].replace(/;\s*$/, "")
}

describe("the migration that removes the stored placeholders", () => {
  it("E37: deletes only rows under the placeholder path; a real image survives", async () => {
    const productId = await ryzen()
    const rows = [
      "/images/placeholders/cpu.svg",
      "/images/placeholders/box.svg",
      "/images/placeholders/detail.svg",
      BLOB_URL,
      "/images/placeholder-lookalike.png",
      "https://example.com/images/placeholders/cpu.svg",
    ]
    for (const [sortOrder, url] of rows.entries()) {
      await db.productImage.create({
        data: { productId, url, alt: "a", sortOrder },
      })
    }

    await db.$executeRawUnsafe(placeholderDeletion())

    const left = await db.productImage.findMany({
      orderBy: { sortOrder: "asc" },
      select: { url: true },
    })
    expect(left.map((row) => row.url)).toEqual([
      BLOB_URL,
      "/images/placeholder-lookalike.png",
      "https://example.com/images/placeholders/cpu.svg",
    ])
  })

  it("does nothing when there are no placeholder rows", async () => {
    await ryzen()
    await db.$executeRawUnsafe(placeholderDeletion())
    expect(await db.productImage.count()).toBe(0)
  })
})

describe("FakeStoredImage", () => {
  it("keeps the bytes and the content type by name", async () => {
    await db.fakeStoredImage.create({
      data: {
        name: "abc.webp",
        contentType: "image/webp",
        bytes: Buffer.from([1, 2, 3]),
      },
    })
    const row = await db.fakeStoredImage.findUniqueOrThrow({
      where: { name: "abc.webp" },
    })
    expect([...row.bytes]).toEqual([1, 2, 3])
    expect(row.contentType).toBe("image/webp")
  })

  it("a catalog reset empties it", async () => {
    await db.fakeStoredImage.create({
      data: {
        name: "a.webp",
        contentType: "image/webp",
        bytes: Buffer.from([1]),
      },
    })
    await resetCatalog()
    expect(await db.fakeStoredImage.count()).toBe(0)
  })
})
