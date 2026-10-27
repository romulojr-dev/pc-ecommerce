import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { ListingSort } from "@/lib/listing-params"
import { getCategoryProducts } from "@/lib/products"
import { db, FIXTURE_TODAY, insertFixtures } from "@/test-support/db"

// How getCategoryProducts orders the fixtures (docs/specs/012-common-filters):
// price sorts use the price the shopper pays, and ties end on name, then id.

let cpuId: string

beforeAll(async () => {
  ;({ cpuId } = await insertFixtures())
})

afterAll(() => db.$disconnect())

async function names(sort: ListingSort) {
  const { products } = await getCategoryProducts(
    { id: cpuId, slug: "cpu" },
    { sort, page: 1, filters: {} },
    { today: FIXTURE_TODAY }
  )
  return products.map((product) => product.name)
}

describe("getCategoryProducts sort", () => {
  it("price-asc orders by the effective price", async () => {
    // P2 is 9,000 on sale. By list price (12,000) it would come after P3.
    expect(await names("price-asc")).toEqual(["P1", "P2", "P3", "P5", "P4"])
  })

  it("price-desc is the reverse", async () => {
    expect(await names("price-desc")).toEqual(["P4", "P5", "P3", "P2", "P1"])
  })

  it("newest puts the latest first", async () => {
    expect(await names("newest")).toEqual(["P5", "P4", "P3", "P2", "P1"])
  })

  it("keeps the order of equal prices stable, by name", async () => {
    // Two more products at P3's price
    const { brandId, categoryId } = await db.product.findFirstOrThrow({
      where: { name: "P3" },
      select: { brandId: true, categoryId: true },
    })
    for (const name of ["P3b", "P3a"]) {
      await db.product.create({
        data: {
          name,
          slug: name.toLowerCase(),
          sku: `SKU-${name}`,
          price: 1_000_000,
          stock: 1,
          status: "ACTIVE",
          specs: {},
          weightGrams: 100,
          categoryId,
          brandId,
        },
      })
    }
    try {
      expect(await names("price-asc")).toEqual([
        "P1",
        "P2",
        "P3",
        "P3a",
        "P3b",
        "P5",
        "P4",
      ])
    } finally {
      await db.product.deleteMany({ where: { name: { in: ["P3a", "P3b"] } } })
    }
  })
})
