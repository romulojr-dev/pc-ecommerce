import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import type { FilterValues } from "@/lib/listing-filters"
import type { ListingSort } from "@/lib/listing-params"
import {
  getSearchFilterOptions,
  getSearchProducts,
  getSearchScope,
} from "@/lib/search"
import {
  createCategoryAndBrand,
  db,
  FIXTURE_TODAY,
  insertSearchFixtures,
  resetCatalog,
  type SearchFixtureKey,
} from "@/test-support/db"

// Keyword search (docs/specs/014-search, docs/adr/0005): the triggers that
// keep Product.searchVector up to date, then the search queries against the
// spec's fixtures (F1–F14) and its fixed list of queries. A failing
// expectation here is reported, never edited to match the output.

let categoryId: string
let brandId: string

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
  beforeEach(async () => {
    await resetCatalog()
    ;({ categoryId, brandId } = await createCategoryAndBrand(
      { name: "Graphics Card", slug: "gpu" },
      { name: "Gigabyte", slug: "gigabyte" }
    ))
  })

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

// The fixture keys of one page of results, in order
async function search(
  q: string,
  {
    sort,
    filters = {},
    page = 1,
  }: { sort?: ListingSort; filters?: FilterValues; page?: number } = {}
): Promise<{ keys: SearchFixtureKey[]; total: number }> {
  const scope = await getSearchScope(q)
  const { products, total } = await getSearchProducts(
    scope,
    { sort: sort ?? (q ? "relevance" : "newest"), page, filters },
    { today: FIXTURE_TODAY }
  )
  return { keys: products.map((product) => keyOf.get(product.slug)!), total }
}

let keyOf: Map<string, SearchFixtureKey>

describe("search queries", () => {
  beforeAll(async () => {
    await insertSearchFixtures()
    const rows = await db.product.findMany({ select: { slug: true } })
    // Fixture slugs are their keys in lower case
    keyOf = new Map(
      rows.map(({ slug }) => [slug, slug.toUpperCase() as SearchFixtureKey])
    )
  })

  // The spec's query table: exactly these matches, and the first one where
  // the spec gives one
  it.each<[string, SearchFixtureKey[], SearchFixtureKey?]>([
    // Plain and Ti are a near-tie in word matching, so no order is checked
    // (spec 014, "Ranking"; a variant rule is Phase 2)
    ["rtx 5070", ["F1", "F2"]],
    ["5070", ["F1", "F2"]],
    ["RTX5070", ["F1", "F2"]],
    ["7800x3d", ["F4"]],
    ["x3d", ["F4", "F5"]],
    ["780", ["F4"]],
    ["ryzen 7", ["F4", "F5"]],
    ["b650", ["F8", "F9"]],
    ["16gb ddr5", ["F11", "F13"], "F11"],
    ["i5-14400f", ["F7"]],
    ["GV-N5070WF3OC-12GD", ["F1"]],
    ["am5", ["F4", "F5", "F6", "F8", "F9"]],
    ["lga1700", ["F7", "F10"]],
    ["nvidia", ["F1", "F2", "F3"]],
    ["motherboard", ["F8", "F9", "F10"]],
    ["asus", ["F3", "F8"]],
    ["geforce rtx 5070 super", []],
  ])("%j finds %j", async (q, expected, first) => {
    const { keys, total } = await search(q)
    expect([...keys].sort()).toEqual([...expected].sort())
    expect(total).toBe(expected.length)
    if (first) expect(keys[0]).toBe(first)
  })

  it("never finds a draft (F14 is a draft copy of F1)", async () => {
    const { keys } = await search("windforce")
    expect(keys).toEqual(["F1"])
  })

  it("lists every active product without a query, newest first", async () => {
    const { keys, total } = await search("")
    expect(total).toBe(13)
    expect(keys[0]).toBe("F13")
  })

  it("lists one brand's products without a query (Shop by brand)", async () => {
    const { keys } = await search("", { filters: { brand: ["amd"] } })
    expect(keys).toEqual(["F6", "F5", "F4"])
  })

  it.each([
    "!!!",
    "'",
    '"',
    "\\",
    "&",
    "|",
    "!",
    ":*",
    "(",
    "<->",
    "a & | ! b",
    "(rtx & 5070) | !super",
    "😀",
    "a".repeat(1000),
  ])("returns without error for %j", async (q) => {
    await expect(search(q)).resolves.toBeDefined()
  })

  it.each(["!!!", "(<->)", ":*", "😀"])(
    "finds nothing for %j, which has no letters or digits",
    async (q) => {
      expect(await search(q)).toEqual({ keys: [], total: 0 })
    }
  )

  it("treats SQL in the query as text", async () => {
    const { keys } = await search(`'; DROP TABLE "Product"; --`)
    expect(keys).toEqual([])
    expect(await db.product.count()).toBe(14)
  })

  it("caps the query at 16 tokens without failing", async () => {
    const { keys } = await search(`rtx 5070 ${"geforce ".repeat(30)}`)
    expect([...keys].sort()).toEqual(["F1", "F2"])
  })

  it("counts the matches' categories with the other filters applied", async () => {
    const scope = await getSearchScope("ddr5")
    const options = await getSearchFilterOptions(
      scope,
      {},
      { today: FIXTURE_TODAY }
    )
    expect(options.category).toEqual([
      { value: "memory", label: "Memory", count: 2 },
      { value: "motherboard", label: "Motherboard", count: 2 },
    ])

    const kingston = await getSearchFilterOptions(
      scope,
      { brand: ["kingston"] },
      { today: FIXTURE_TODAY }
    )
    expect(kingston.category).toEqual([
      { value: "memory", label: "Memory", count: 1 },
      { value: "motherboard", label: "Motherboard", count: 0 },
    ])
  })

  it("combines the query with category and brand filters", async () => {
    const { keys } = await search("rtx", {
      filters: { category: ["gpu"], brand: ["asus"] },
    })
    expect(keys).toEqual(["F3"])
    expect(
      (await search("ddr5", { filters: { category: ["memory"] } })).keys.sort()
    ).toEqual(["F11", "F13"])
  })

  it("sorts matches by price and by date", async () => {
    expect((await search("rtx 5070", { sort: "price-asc" })).keys).toEqual([
      "F2",
      "F1",
    ])
    expect((await search("rtx 5070", { sort: "price-desc" })).keys).toEqual([
      "F1",
      "F2",
    ])
    expect((await search("rtx 5070", { sort: "newest" })).keys).toEqual([
      "F2",
      "F1",
    ])
  })
})
