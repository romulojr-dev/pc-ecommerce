import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { PrismaClient } from "@/generated/prisma/client"
import { listingFilters } from "@/lib/listing-filters"
import { activeWhere } from "@/lib/listing-filters/server"
import { categoryTarget, parseListingParams } from "@/lib/listing-params"
import { getCategoryProducts, getFilterOptions } from "@/lib/products"
import { db, FIXTURE_TODAY, insertSpecFixtures } from "@/test-support/db"

import type { FilterValues } from "./index"

// Spec filters and option counts against the known fixtures
// (docs/specs/013-spec-filters, "Tests"). GPUs X1–X4 are active (X3 out of
// stock), X5 is a draft; coolers C1–C4; motherboards M1 (Wi-Fi) and M2.

type Category = { id: string; slug: string }
let gpu: Category
let cooler: Category
let board: Category

beforeAll(async () => {
  const categories = await insertSpecFixtures()
  gpu = categories.gpu
  cooler = categories["cpu-cooler"]
  board = categories.motherboard
})

afterAll(() => db.$disconnect())

const context = { today: FIXTURE_TODAY }

// Product names, cheapest first (fixture order)
async function list(category: Category, filters: FilterValues) {
  const { products } = await getCategoryProducts(
    category,
    { sort: "price-asc", page: 1, filters },
    context
  )
  return products.map((product) => product.name)
}

const options = (category: Category, filters: FilterValues) =>
  getFilterOptions(category, filters, context)

describe("enum", () => {
  it("matches one value, never a draft", async () => {
    expect(await list(gpu, { chipsetBrand: ["NVIDIA"] })).toEqual(["X1", "X2"])
  })

  it("matches any of several values", async () => {
    expect(await list(gpu, { chipsetBrand: ["NVIDIA", "AMD"] })).toEqual([
      "X1",
      "X2",
      "X3",
      "X4",
    ])
  })
})

describe("values", () => {
  it("matches text", async () => {
    expect(await list(gpu, { chipset: ["RX C"] })).toEqual(["X3", "X4"])
  })

  it("matches numbers, and never a product without the field", async () => {
    // Air coolers have no radiator size
    expect(await list(cooler, { radiatorSizeMm: ["240"] })).toEqual(["C3"])
  })
})

describe("range", () => {
  it("takes a minimum alone", async () => {
    expect(await list(gpu, { vramGb: { min: 12, max: null } })).toEqual([
      "X2",
      "X3",
      "X4",
    ])
  })

  it("includes both bounds", async () => {
    expect(await list(gpu, { lengthMm: { min: 300, max: 320 } })).toEqual([
      "X2",
      "X3",
    ])
  })

  it("takes a maximum alone", async () => {
    expect(await list(gpu, { lengthMm: { min: null, max: 300 } })).toEqual([
      "X1",
      "X2",
    ])
  })
})

describe("contains", () => {
  it("matches a list holding the value", async () => {
    expect(await list(cooler, { supportedSockets: ["AM5"] })).toEqual([
      "C1",
      "C3",
      "C4",
    ])
  })

  it("matches a list holding any of the values", async () => {
    expect(
      await list(cooler, { supportedSockets: ["AM4", "LGA1700"] })
    ).toEqual(["C1", "C2", "C3"])
  })
})

describe("boolean", () => {
  it("matches true only", async () => {
    expect(await list(board, { hasWifi: true })).toEqual(["M1"])
  })
})

describe("filters combine with AND", () => {
  it("across spec filters", async () => {
    expect(
      await list(gpu, {
        chipsetBrand: ["AMD"],
        lengthMm: { min: 330, max: null },
      })
    ).toEqual(["X4"])
  })

  it("with brand and in stock", async () => {
    expect(
      await list(gpu, { brand: ["alpha"], vramGb: { min: 12, max: null } })
    ).toEqual(["X2"])
    expect(await list(gpu, { inStock: true, chipset: ["RX C"] })).toEqual([
      "X4",
    ])
  })
})

describe("option counts", () => {
  it("offers only the values the category has, counted", async () => {
    const found = await options(gpu, {})
    // No Intel GPU, so no Intel option; X5 (draft) isn't counted
    expect(found.chipsetBrand).toEqual([
      { value: "NVIDIA", label: "NVIDIA", count: 2 },
      { value: "AMD", label: "AMD", count: 2 },
    ])
    expect(found.chipset).toEqual([
      { value: "RTX A", label: "RTX A", count: 1 },
      { value: "RTX B", label: "RTX B", count: 1 },
      { value: "RX C", label: "RX C", count: 2 },
    ])
    expect(found.brand).toEqual([
      { value: "alpha", label: "Alpha", count: 2 },
      { value: "beta", label: "Beta", count: 2 },
    ])
  })

  it("counts each option with the other filters, not its own", async () => {
    const found = await options(gpu, { chipsetBrand: ["AMD"] })
    // Its own filter is left out, so checking AMD doesn't zero NVIDIA
    expect(found.chipsetBrand?.map((option) => option.count)).toEqual([2, 2])
    expect(found.chipset?.map((option) => option.count)).toEqual([0, 0, 2])
    expect(found.brand?.map((option) => option.count)).toEqual([0, 2])
  })

  it("keeps a checked option even when the others leave it at 0", async () => {
    const found = await options(gpu, {
      chipsetBrand: ["NVIDIA"],
      vramGb: { min: 16, max: null },
    })
    expect(found.chipsetBrand).toEqual([
      { value: "NVIDIA", label: "NVIDIA", count: 0 },
      { value: "AMD", label: "AMD", count: 2 },
    ])
    expect(
      await list(gpu, {
        chipsetBrand: ["NVIDIA"],
        vramGb: { min: 16, max: null },
      })
    ).toEqual([])
  })

  it("counts a list's values once per product", async () => {
    expect((await options(cooler, {})).supportedSockets).toEqual([
      { value: "AM4", label: "AM4", count: 1 },
      { value: "AM5", label: "AM5", count: 3 },
      { value: "LGA1700", label: "LGA1700", count: 2 },
    ])
  })

  it("counts a boolean's true values", async () => {
    expect((await options(board, {})).hasWifi).toEqual([
      { value: "1", label: "Wi-Fi", count: 1 },
    ])
  })

  it("gives a range its values, for the placeholders", async () => {
    const vram = (await options(gpu, {})).vramGb
    expect(vram?.map((option) => option.value)).toEqual(["8", "12", "16"])
  })
})

describe("what the URL can't do", () => {
  it("ignores non-filterable fields, other categories' fields and odd keys", async () => {
    const raw = Object.fromEntries([
      ["boardPowerW", "300"],
      ["threads", "8"],
      ["socket", "AM5"],
      ["__proto__", "x"],
    ])
    const { filters } = parseListingParams(categoryTarget("gpu"), raw)
    expect(filters).toEqual({})
    expect(await list(gpu, filters)).toEqual(["X1", "X2", "X3", "X4"])
  })

  it("treats SQL in a value as plain text", async () => {
    const injection = `'; DROP TABLE "Product"; --`
    const { filters } = parseListingParams(categoryTarget("gpu"), {
      chipset: injection,
    })
    expect(filters).toEqual({ chipset: [injection] })
    expect(await list(gpu, filters)).toEqual([])
    expect(await db.product.count()).toBe(11)
  })

  it("sends values as parameters, not in the SQL text", async () => {
    const logged = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
      log: [{ emit: "event", level: "query" }],
    })
    const queries: { query: string; params: string }[] = []
    logged.$on("query", ({ query, params }) => queries.push({ query, params }))

    try {
      await logged.product.findMany({
        where: {
          AND: activeWhere(
            { chipset: ["RX C"] },
            context,
            listingFilters("gpu")
          ),
        },
        select: { id: true },
      })
    } finally {
      await logged.$disconnect()
    }

    const query = queries.find(({ params }) => params.includes("RX C"))
    expect(query, "a query with the value as a parameter").toBeDefined()
    expect(query!.query).not.toContain("RX C")
  })
})
