import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createCategoryAndBrand, db, resetCatalog } from "@/test-support/db"

// The triggers that keep Product.searchVector up to date (docs/specs/014-
// search, docs/adr/0005). Matches go through search_query, the function the
// search page uses.

let categoryId: string
let brandId: string

beforeEach(async () => {
  await resetCatalog()
  ;({ categoryId, brandId } = await createCategoryAndBrand(
    { name: "Graphics Card", slug: "gpu" },
    { name: "Gigabyte", slug: "gigabyte" }
  ))
})

afterAll(() => db.$disconnect())

function createProduct(
  data: { name?: string; sku?: string; specs?: object } = {}
) {
  return db.product.create({
    data: {
      name: "Windforce OC 12G",
      slug: "windforce",
      sku: "GV-N5070WF3OC-12GD",
      price: 1_000_000,
      specs: {},
      weightGrams: 100,
      categoryId,
      brandId,
      ...data,
    },
    select: { id: true },
  })
}

// True when the product's vector matches the text, read as the shopper's
// query. A weight (A–D) checks where the text was found.
async function matches(id: string, text: string, weight?: string) {
  const [row] = await db.$queryRaw<{ hit: boolean | null }[]>`
    SELECT "searchVector" @@ (
      CASE WHEN ${weight ?? null}::text IS NULL THEN search_query(${text})
      ELSE to_tsquery('simple', search_normalize(${text}) || ':' || ${weight ?? ""})
      END
    ) AS hit
    FROM "Product" WHERE id = ${id}`
  return row.hit === true
}

describe("searchVector trigger", () => {
  it("is set on insert from name, brand, SKU, spec strings and category", async () => {
    const { id } = await createProduct({
      specs: {
        chipset: "GeForce RTX 5070",
        sockets: ["AM5", "LGA1700"],
        lengthMm: 282,
      },
    })

    expect(await matches(id, "windforce")).toBe(true)
    expect(await matches(id, "gigabyte")).toBe(true)
    expect(await matches(id, "GV-N5070WF3OC-12GD")).toBe(true)
    expect(await matches(id, "geforce")).toBe(true)
    // A string inside a spec array
    expect(await matches(id, "lga1700")).toBe(true)
    expect(await matches(id, "graphics card")).toBe(true)
    // Numbers in specs are left out
    expect(await matches(id, "282")).toBe(false)
  })

  it("weights name A, brand and SKU B, spec strings C, category D", async () => {
    const { id } = await createProduct({
      name: "Windforce",
      sku: "QQSKU",
      specs: { chipset: "Blackwell" },
    })

    expect(await matches(id, "windforce", "A")).toBe(true)
    expect(await matches(id, "gigabyte", "B")).toBe(true)
    expect(await matches(id, "qqsku", "B")).toBe(true)
    expect(await matches(id, "blackwell", "C")).toBe(true)
    expect(await matches(id, "graphics", "D")).toBe(true)
    expect(await matches(id, "gigabyte", "A")).toBe(false)
  })

  it("follows a name or specs update", async () => {
    const { id } = await createProduct({ specs: { chipset: "Blackwell" } })

    await db.product.update({
      where: { id },
      data: { name: "Eagle", specs: { chipset: "Ada" } },
    })
    expect(await matches(id, "eagle")).toBe(true)
    expect(await matches(id, "windforce")).toBe(false)
    expect(await matches(id, "ada")).toBe(true)
    expect(await matches(id, "blackwell")).toBe(false)
  })

  it("overrides a value written straight to the column (ADR 0005: the app never writes it)", async () => {
    const { id } = await createProduct()

    await db.$executeRaw`
      UPDATE "Product" SET "searchVector" = to_tsvector('simple', 'bogus')
      WHERE id = ${id}`
    expect(await matches(id, "bogus")).toBe(false)
    expect(await matches(id, "windforce")).toBe(true)
  })

  it("follows a brand rename", async () => {
    const { id } = await createProduct()

    await db.brand.update({ where: { id: brandId }, data: { name: "Zotac" } })
    expect(await matches(id, "zotac")).toBe(true)
    expect(await matches(id, "gigabyte")).toBe(false)
  })

  it("follows a category rename", async () => {
    const { id } = await createProduct()

    await db.category.update({
      where: { id: categoryId },
      data: { name: "Video Card" },
    })
    expect(await matches(id, "video card")).toBe(true)
    expect(await matches(id, "graphics")).toBe(false)
  })
})
