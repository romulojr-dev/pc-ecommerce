import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { db, resetCatalog } from "@/test-support/db"

import { seedFiles } from "./data"
import { shippingSeed } from "./data/shipping"
import { validateSeed } from "./validate"
import { writeSeed } from "./write"

// docs/specs/045-admin-products-create-edit, E28–E30: a re-seed creates what
// is missing and never changes what exists

const validation = validateSeed(seedFiles)
if (!validation.ok) throw new Error("the seed data is invalid")
// Two PSUs and a cooler keep the run short
const psu = validation.files.find((file) => file.category === "psu")!
const cooler = validation.files.find((file) => file.category === "cpu-cooler")!
const slice = (psuCount: number) => [
  { ...psu, parts: psu.parts.slice(0, psuCount) },
  { ...cooler, parts: cooler.parts.slice(0, 1) },
]
const options = { reset: false, shipping: shippingSeed }

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

describe("a re-seed is create-only", () => {
  it("E29: a seed into an empty database creates everything", async () => {
    const counts = await writeSeed(db, slice(2), options)
    expect(counts).toMatchObject({ created: 3, existing: 0 })
    expect(await db.product.count()).toBe(3)
    expect(await db.category.count()).toBe(8)
  })

  it("E28: edits made in Admin survive a re-seed", async () => {
    await writeSeed(db, slice(2), options)
    const target = await db.product.findFirstOrThrow({
      where: { category: { slug: "cpu-cooler" } },
    })
    const other = await db.brand.create({
      data: { name: "Other", slug: "other" },
    })
    await db.product.update({
      where: { id: target.id },
      data: {
        name: "Renamed in Admin",
        description: "Edited",
        isFeatured: true,
        weightGrams: 1,
        warrantyMonths: 3,
        boxContents: ["Only this"],
        brandId: other.id,
        specs: { edited: true },
      },
    })
    await db.category.update({
      where: { slug: "cpu" },
      data: { name: "Processors", sortOrder: 99 },
    })
    await db.brand.update({
      where: { id: other.id },
      data: { name: "Renamed" },
    })
    const before = await db.product.findUniqueOrThrow({
      where: { id: target.id },
    })

    const counts = await writeSeed(db, slice(2), options)

    expect(counts).toMatchObject({ created: 0, existing: 3 })
    const after = await db.product.findUniqueOrThrow({
      where: { id: target.id },
    })
    expect(after).toEqual(before)
    expect(after.name).toBe("Renamed in Admin")
    expect(
      await db.category.findUniqueOrThrow({ where: { slug: "cpu" } })
    ).toMatchObject({
      name: "Processors",
      sortOrder: 99,
    })
    expect(
      (await db.brand.findUniqueOrThrow({ where: { id: other.id } })).name
    ).toBe("Renamed")
  })

  it("E30: a part added to the data is the only creation", async () => {
    await writeSeed(db, slice(1), options)
    const counts = await writeSeed(db, slice(2), options)
    expect(counts).toMatchObject({ created: 1, existing: 2 })
    expect(await db.product.count()).toBe(3)
  })

  it("E37, E38: the seed writes no image rows, and never brings back what the owner removed", async () => {
    await writeSeed(db, slice(1), options)
    expect(await db.productImage.count()).toBe(0)

    // The owner adds a photo to one product and removes every photo of another
    const [kept] = await db.product.findMany({ take: 1 })
    await db.productImage.create({
      data: {
        productId: kept.id,
        url: "https://abc123.public.blob.vercel-storage.com/products/x.webp",
        alt: kept.name,
        sortOrder: 0,
      },
    })
    const counts = await writeSeed(db, slice(1), options)
    expect(counts).not.toHaveProperty("images")
    expect(await db.productImage.count()).toBe(1)
    expect((await db.productImage.findFirstOrThrow()).url).toBe(
      "https://abc123.public.blob.vercel-storage.com/products/x.webp"
    )
  })
})
