import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { HOME_LIMIT, loadHomeBrands, loadHomeProducts } from "@/lib/home"
import { db, resetCatalog } from "@/test-support/db"

// The home page's Featured products, Deals and Shop by brand
// (docs/specs/016-home-page). Each test builds its own catalog: two
// categories (CPU first, then GPU) and one brand.

let cpuId: string
let gpuId: string
let brandId: string

beforeEach(async () => {
  await resetCatalog()
  ;[{ id: cpuId }, { id: gpuId }, { id: brandId }] = await Promise.all([
    db.category.create({ data: { name: "CPU", slug: "cpu", sortOrder: 1 } }),
    db.category.create({ data: { name: "GPU", slug: "gpu", sortOrder: 2 } }),
    db.brand.create({ data: { name: "Alpha", slug: "alpha" } }),
  ])
})

afterAll(() => db.$disconnect())

type Fixture = {
  name: string
  // Pesos
  price: number
  salePrice?: number
  stock?: number
  status?: "ACTIVE" | "DRAFT"
  preorderShipsOn?: string
  featured?: boolean
  category?: "cpu" | "gpu"
  brandId?: string
}

async function insert(...products: Fixture[]) {
  for (const product of products) {
    const slug = product.name.toLowerCase().replace(/\W+/g, "-")
    await db.product.create({
      data: {
        name: product.name,
        slug,
        sku: `SKU-${slug}`,
        price: product.price * 100,
        salePrice: product.salePrice && product.salePrice * 100,
        stock: product.stock ?? 10,
        lowStockAt: 5,
        preorderShipsOn: product.preorderShipsOn
          ? new Date(product.preorderShipsOn)
          : null,
        status: product.status ?? "ACTIVE",
        isFeatured: product.featured ?? false,
        specs: {},
        weightGrams: 100,
        categoryId: product.category === "gpu" ? gpuId : cpuId,
        brandId: product.brandId ?? brandId,
      },
    })
  }
}

async function names() {
  const { featured, deals } = await loadHomeProducts()
  return {
    featured: featured.map((product) => product.name),
    deals: deals.map((product) => product.name),
  }
}

// n products named `${prefix}1`, `${prefix}2`, …
const many = (n: number, prefix: string, fixture: Omit<Fixture, "name">) =>
  Array.from({ length: n }, (_, i) => ({
    ...fixture,
    name: `${prefix}${i + 1}`,
  }))

describe("featured", () => {
  it("shows only featured, active products", async () => {
    await insert(
      { name: "Shown", price: 1000, featured: true },
      { name: "Draft", price: 1000, featured: true, status: "DRAFT" },
      { name: "Plain", price: 1000 }
    )
    expect((await names()).featured).toEqual(["Shown"])
  })

  it("orders by category, then name", async () => {
    await insert(
      { name: "G-A", price: 1000, featured: true, category: "gpu" },
      { name: "C-B", price: 1000, featured: true },
      { name: "C-A", price: 1000, featured: true }
    )
    expect((await names()).featured).toEqual(["C-A", "C-B", "G-A"])
  })

  it("keeps out-of-stock featured products", async () => {
    await insert({ name: "Gone", price: 1000, featured: true, stock: 0 })
    expect((await names()).featured).toEqual(["Gone"])
  })

  it(`shows at most ${HOME_LIMIT}`, async () => {
    await insert(...many(HOME_LIMIT + 1, "F", { price: 1000, featured: true }))
    expect((await names()).featured).toHaveLength(HOME_LIMIT)
  })
})

describe("deals", () => {
  it("are products with a sale price below the list price", async () => {
    await insert(
      { name: "Deal", price: 1000, salePrice: 800 },
      { name: "Same", price: 1000, salePrice: 1000 },
      { name: "Above", price: 1000, salePrice: 1200 },
      { name: "Full", price: 1000 }
    )
    expect((await names()).deals).toEqual(["Deal"])
  })

  it("can be bought: stock left (pre-orders count) and active", async () => {
    await insert(
      {
        name: "Pre-order",
        price: 1000,
        salePrice: 800,
        stock: 5,
        preorderShipsOn: "2027-01-15",
      },
      { name: "Sold out", price: 1000, salePrice: 700, stock: 0 },
      { name: "Draft", price: 1000, salePrice: 700, status: "DRAFT" }
    )
    expect((await names()).deals).toEqual(["Pre-order"])
  })

  it("orders by whole percent off, then saving, then name", async () => {
    await insert(
      // 33.3% off and 33.3% off both floor to 33, so the bigger saving wins
      { name: "Small 33%", price: 3000, salePrice: 2000 },
      { name: "Big 33%", price: 30000, salePrice: 20001 },
      { name: "34%", price: 100, salePrice: 66 },
      // Same percent and saving: by name
      { name: "B 20%", price: 1000, salePrice: 800 },
      { name: "A 20%", price: 1000, salePrice: 800 }
    )
    expect((await names()).deals).toEqual([
      "34%",
      "Big 33%",
      "Small 33%",
      "A 20%",
      "B 20%",
    ])
  })

  it(`shows at most ${HOME_LIMIT}`, async () => {
    await insert(...many(HOME_LIMIT + 1, "D", { price: 1000, salePrice: 900 }))
    expect((await names()).deals).toHaveLength(HOME_LIMIT)
  })
})

describe("no duplicates", () => {
  it("leaves a featured deal to Featured, and the next deal takes its slot", async () => {
    await insert(
      { name: "Featured deal", price: 1000, salePrice: 500, featured: true },
      ...many(HOME_LIMIT, "D", { price: 1000, salePrice: 900 })
    )
    const { featured, deals } = await names()
    expect(featured).toEqual(["Featured deal"])
    expect(deals).not.toContain("Featured deal")
    expect(deals).toHaveLength(HOME_LIMIT)
  })

  it("lets a featured product that Featured doesn't show be a deal", async () => {
    // 9 featured, all on sale: F1–F8 are shown, F9 isn't, so it is a deal
    await insert(
      ...many(HOME_LIMIT + 1, "F", {
        price: 1000,
        salePrice: 900,
        featured: true,
      })
    )
    const { featured, deals } = await names()
    expect(featured).toEqual(
      many(HOME_LIMIT, "F", { price: 0 }).map((f) => f.name)
    )
    expect(deals).toEqual([`F${HOME_LIMIT + 1}`])
  })
})

describe("brands", () => {
  it("lists brands with an active product, by name", async () => {
    const [{ id: zetaId }, { id: draftOnlyId }] = await Promise.all([
      db.brand.create({ data: { name: "Zeta", slug: "zeta" } }),
      db.brand.create({ data: { name: "Draft only", slug: "draft-only" } }),
      db.brand.create({ data: { name: "Empty", slug: "empty" } }),
    ])
    await insert(
      { name: "Z1", price: 1000, brandId: zetaId },
      { name: "A1", price: 1000 },
      { name: "D1", price: 1000, brandId: draftOnlyId, status: "DRAFT" }
    )
    expect(await loadHomeBrands()).toEqual([
      { name: "Alpha", slug: "alpha" },
      { name: "Zeta", slug: "zeta" },
    ])
  })
})
