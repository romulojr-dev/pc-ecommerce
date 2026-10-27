import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { FilterValues } from "@/lib/listing-filters"
import type { ListingSort } from "@/lib/listing-params"
import { getCategoryProducts, getFilterOptions } from "@/lib/products"
import { getStockStatus } from "@/lib/stock"
import { db, FIXTURE_TODAY, insertFixtures } from "@/test-support/db"

// The filters' database conditions against the known fixtures
// (docs/specs/012-common-filters). By effective price (pesos): P1 5,000,
// P2 9,000 (sale), P3 10,000, P5 15,000, P4 20,000; so price-asc lists them
// in that order, while the list prices would put P3 before P2.

let cpuId: string

beforeAll(async () => {
  ;({ cpuId } = await insertFixtures())
})

afterAll(() => db.$disconnect())

// Product names and the total, cheapest first unless told otherwise
async function list(
  filters: FilterValues,
  {
    sort = "price-asc",
    today = FIXTURE_TODAY,
  }: {
    sort?: ListingSort
    today?: string
  } = {}
) {
  const { products, total } = await getCategoryProducts(
    { id: cpuId, slug: "cpu" },
    { sort, page: 1, filters },
    { today }
  )
  return { names: products.map((product) => product.name), total }
}

describe("no filters", () => {
  it("lists the category's active products only", async () => {
    // Not P6 (draft) or G1 (another category)
    expect(await list({})).toEqual({
      names: ["P1", "P2", "P3", "P5", "P4"],
      total: 5,
    })
  })
})

describe("brand", () => {
  it("shows the category's brands: not draft-only or other categories'", async () => {
    // Gamma only has a draft CPU, Delta only a GPU
    const options = await getFilterOptions(
      { id: cpuId, slug: "cpu" },
      {},
      { today: FIXTURE_TODAY }
    )
    expect(options.brand).toEqual([
      { value: "alpha", label: "Alpha", count: 2 },
      { value: "beta", label: "Beta", count: 3 },
    ])
  })

  it("matches one brand", async () => {
    expect(await list({ brand: ["alpha"] })).toEqual({
      names: ["P1", "P2"],
      total: 2,
    })
  })

  it("matches any of several brands", async () => {
    expect(await list({ brand: ["alpha", "beta"] })).toEqual({
      names: ["P1", "P2", "P3", "P5", "P4"],
      total: 5,
    })
  })

  it("doesn't reach into other categories or drafts", async () => {
    expect(await list({ brand: ["delta"] })).toEqual({ names: [], total: 0 })
    expect(await list({ brand: ["gamma"] })).toEqual({ names: [], total: 0 })
  })
})

describe("price (effective price, whole pesos)", () => {
  it("uses the sale price: P2 is 9,000, not 12,000", async () => {
    expect(await list({ price: { min: 6000, max: 9500 } })).toEqual({
      names: ["P2"],
      total: 1,
    })
  })

  it("includes both bounds", async () => {
    expect(await list({ price: { min: 9000, max: 10000 } })).toEqual({
      names: ["P2", "P3"],
      total: 2,
    })
  })

  it("takes a minimum alone", async () => {
    expect(await list({ price: { min: 15000, max: null } })).toEqual({
      names: ["P5", "P4"],
      total: 2,
    })
  })

  it("takes a maximum alone", async () => {
    expect(await list({ price: { min: null, max: 9000 } })).toEqual({
      names: ["P1", "P2"],
      total: 2,
    })
  })

  it("matches an exact price", async () => {
    expect(await list({ price: { min: 10000, max: 10000 } })).toEqual({
      names: ["P3"],
      total: 1,
    })
  })

  it("can match nothing", async () => {
    expect(await list({ price: { min: 100000, max: null } })).toEqual({
      names: [],
      total: 0,
    })
  })
})

describe("in stock only", () => {
  it("keeps in stock and low stock, drops out of stock and pre-orders", async () => {
    // P1 in stock, P2 low stock, P5 pre-order ended today; not P3 (none
    // left) or P4 (still a pre-order)
    expect(await list({ inStock: true })).toEqual({
      names: ["P1", "P2", "P5"],
      total: 3,
    })
  })

  it("brings a pre-order back once its ship date is today", async () => {
    // A day earlier, P5 is still a pre-order
    expect(
      (await list({ inStock: true }, { today: "2026-10-25" })).names
    ).toEqual(["P1", "P2"])
    // And P4 ships on 2027-01-15
    expect(
      (await list({ inStock: true }, { today: "2027-01-15" })).names
    ).toEqual(["P1", "P2", "P5", "P4"])
  })

  it("agrees with getStockStatus on every product", async () => {
    const rows = await db.product.findMany({
      where: { categoryId: cpuId, status: "ACTIVE" },
      select: {
        name: true,
        stock: true,
        lowStockAt: true,
        preorderShipsOn: true,
      },
    })
    for (const today of ["2026-10-25", FIXTURE_TODAY, "2027-01-15"]) {
      const expected = rows
        .filter((row) => {
          const status = getStockStatus(
            {
              ...row,
              preorderShipsOn:
                row.preorderShipsOn?.toISOString().slice(0, 10) ?? null,
            },
            today
          )
          return status === "in-stock" || status === "low-stock"
        })
        .map((row) => row.name)
        .sort()
      const { names } = await list({ inStock: true }, { today })
      expect(names.toSorted(), `on ${today}`).toEqual(expected)
    }
  })
})

describe("on sale (docs/specs/016-home-page)", () => {
  // A sale price equal to the list price is set but discounts nothing.
  // Removed afterwards, so the other cases keep the shared fixtures.
  beforeAll(async () => {
    const beta = await db.brand.findUniqueOrThrow({ where: { slug: "beta" } })
    await db.product.create({
      data: {
        name: "P7",
        slug: "p7",
        sku: "P7",
        price: 800_000,
        salePrice: 800_000,
        stock: 5,
        status: "ACTIVE",
        specs: {},
        weightGrams: 100,
        categoryId: cpuId,
        brandId: beta.id,
      },
    })
  })

  afterAll(() => db.product.delete({ where: { sku: "P7" } }))

  it("keeps only a sale price below the list price", async () => {
    // P2 (12,000 → 9,000); not P7 (sale price = list price) or no sale price
    expect(await list({ onSale: true })).toEqual({ names: ["P2"], total: 1 })
  })

  it("combines with the other filters", async () => {
    expect((await list({ onSale: true, inStock: true })).names).toEqual(["P2"])
    expect((await list({ onSale: true, brand: ["beta"] })).names).toEqual([])
  })

  it("narrows the brand counts", async () => {
    const options = await getFilterOptions(
      { id: cpuId, slug: "cpu" },
      { onSale: true },
      { today: FIXTURE_TODAY }
    )
    expect(options.brand).toEqual([
      { value: "alpha", label: "Alpha", count: 1 },
      { value: "beta", label: "Beta", count: 0 },
    ])
  })
})

describe("filters together", () => {
  it("combine with AND across filters", async () => {
    expect(await list({ brand: ["beta"], inStock: true })).toEqual({
      names: ["P5"],
      total: 1,
    })
    expect(
      await list({
        brand: ["alpha", "beta"],
        price: { min: null, max: 10000 },
      })
    ).toEqual({ names: ["P1", "P2", "P3"], total: 3 })
    expect(
      await list({
        brand: ["alpha"],
        price: { min: 6000, max: 20000 },
        inStock: true,
      })
    ).toEqual({ names: ["P2"], total: 1 })
  })

  it("count the filtered products, not the category", async () => {
    const { total } = await list({ brand: ["beta"] })
    expect(total).toBe(3)
  })
})
