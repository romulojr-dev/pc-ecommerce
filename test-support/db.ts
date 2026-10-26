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
