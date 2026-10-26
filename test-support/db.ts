import { db } from "@/lib/db"

// Helpers for the database integration tests (*.db.test.ts, run by
// `pnpm test:db`, docs/specs/012-common-filters)

// Last line of defence before a destructive statement: vitest.db.config.ts
// points DATABASE_URL at TEST_DATABASE_URL, so if they differ here, a test
// is about to run against another database.
function assertTestDatabase() {
  const { DATABASE_URL, TEST_DATABASE_URL } = process.env
  if (!TEST_DATABASE_URL || DATABASE_URL !== TEST_DATABASE_URL) {
    throw new Error(
      "Refusing to touch the database: it is not the integration test database. Run these tests with `pnpm test:db`."
    )
  }
}

// Empties the catalog, like `pnpm db:seed --reset`
export async function resetCatalog() {
  assertTestDatabase()
  await db.$executeRaw`TRUNCATE TABLE "ProductImage", "Product", "Brand", "Category" CASCADE`
}

// One category and one brand, for tests that only need somewhere to put products
export async function createCategoryAndBrand(
  category = { name: "CPU", slug: "cpu" },
  brand = { name: "Alpha", slug: "alpha" }
) {
  const [{ id: categoryId }, { id: brandId }] = await Promise.all([
    db.category.create({ data: category, select: { id: true } }),
    db.brand.create({ data: brand, select: { id: true } }),
  ])
  return { categoryId, brandId }
}

export { db }

// "Today" for fixtures with pre-orders; tests pass it to the queries
export const FIXTURE_TODAY = "2026-10-26"

type FixtureProduct = {
  name: string
  brand: string
  category: "cpu" | "gpu"
  // Centavos
  price: number
  salePrice?: number
  stock: number
  preorderShipsOn?: string
  status?: "ACTIVE" | "DRAFT"
}

// The known catalog the filter tests run against (docs/specs/012-common-
// filters, "Fixtures"). Effective prices in pesos: P1 5,000, P2 9,000 (on
// sale from 12,000), P3 10,000, P4 20,000, P5 15,000. createdAt rises with
// the number, so "newest" is P5, P4, P3, P2, P1.
const FIXTURE_PRODUCTS: FixtureProduct[] = [
  { name: "P1", brand: "Alpha", category: "cpu", price: 500_000, stock: 10 },
  {
    name: "P2",
    brand: "Alpha",
    category: "cpu",
    price: 1_200_000,
    salePrice: 900_000,
    stock: 3, // low stock: lowStockAt is 5
  },
  {
    name: "P3",
    brand: "Beta",
    category: "cpu",
    price: 1_000_000,
    stock: 0, // out of stock
  },
  {
    name: "P4",
    brand: "Beta",
    category: "cpu",
    price: 2_000_000,
    stock: 4,
    preorderShipsOn: "2027-01-15", // pre-order
  },
  {
    name: "P5",
    brand: "Beta",
    category: "cpu",
    price: 1_500_000,
    stock: 6,
    preorderShipsOn: FIXTURE_TODAY, // ships today: the pre-order has ended
  },
  {
    name: "P6",
    brand: "Gamma",
    category: "cpu",
    price: 800_000,
    stock: 5,
    status: "DRAFT", // never listed
  },
  // Another category, to prove scoping
  { name: "G1", brand: "Delta", category: "gpu", price: 700_000, stock: 8 },
]

// Empties the catalog and inserts the fixtures; returns the category ids
export async function insertFixtures() {
  await resetCatalog()

  const categories = {
    cpu: await db.category.create({ data: { name: "CPU", slug: "cpu" } }),
    gpu: await db.category.create({ data: { name: "GPU", slug: "gpu" } }),
  }
  const brands = new Map<string, string>()
  for (const { brand } of FIXTURE_PRODUCTS) {
    if (brands.has(brand)) continue
    const { id } = await db.brand.create({
      data: { name: brand, slug: brand.toLowerCase() },
    })
    brands.set(brand, id)
  }

  for (const [index, product] of FIXTURE_PRODUCTS.entries()) {
    await db.product.create({
      data: {
        name: product.name,
        slug: product.name.toLowerCase(),
        sku: `SKU-${product.name}`,
        price: product.price,
        salePrice: product.salePrice,
        stock: product.stock,
        lowStockAt: 5,
        preorderShipsOn: product.preorderShipsOn
          ? new Date(product.preorderShipsOn)
          : null,
        status: product.status ?? "ACTIVE",
        specs: {},
        weightGrams: 100,
        createdAt: new Date(Date.UTC(2026, 9, 1 + index)),
        categoryId: categories[product.category].id,
        brandId: brands.get(product.brand)!,
      },
    })
  }

  return { cpuId: categories.cpu.id, gpuId: categories.gpu.id }
}
