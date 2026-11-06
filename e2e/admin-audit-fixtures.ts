import { withPool } from "./stock"

// One throwaway product for e2e/admin-audit.spec.ts (docs/specs/047-admin-
// audit-log-view). Inserted directly, in the database the app server uses,
// with the stock helper's production guard, under a SKU prefix, and removed
// (with its movements) before and after. The audit rows the spec makes stay:
// the log refuses deletes by design, and nothing is written to it directly.
// Not a spec itself.

export const SKU_PREFIX = "E2E-AUD-"

export const PRODUCT = {
  id: "e2eaud-alpha",
  sku: `${SKU_PREFIX}ALPHA`,
  name: "E2E Audit Alpha",
  stock: 10,
}

// A staff note Demo must never see
export const NOTE = "E2E audit shelf recount, row 7"

export async function removeAuditFixtures() {
  await withPool(async (pool) => {
    await pool.query(
      `DELETE FROM "StockMovement" WHERE "productId" IN
         (SELECT "id" FROM "Product" WHERE "sku" LIKE $1)`,
      [`${SKU_PREFIX}%`]
    )
    await pool.query('DELETE FROM "Product" WHERE "sku" LIKE $1', [
      `${SKU_PREFIX}%`,
    ])
  })
}

export async function insertAuditFixtures() {
  await removeAuditFixtures()
  await withPool(async (pool) => {
    const category = await pool.query<{ id: string }>(
      'SELECT "id" FROM "Category" ORDER BY "slug" LIMIT 1'
    )
    const brand = await pool.query<{ id: string }>(
      'SELECT "id" FROM "Brand" ORDER BY "slug" LIMIT 1'
    )
    if (!category.rows[0] || !brand.rows[0]) {
      throw new Error("The audit E2E needs a seeded catalog (pnpm db:seed).")
    }
    await pool.query(
      `INSERT INTO "Product"
         ("id", "name", "slug", "sku", "price", "stock", "lowStockAt",
          "status", "specs", "weightGrams", "categoryId", "brandId",
          "updatedAt")
       VALUES ($1, $2, $3, $4, 100000, $5, 5, 'ACTIVE', '{}', 100, $6, $7,
               now())`,
      [
        PRODUCT.id,
        PRODUCT.name,
        PRODUCT.sku.toLowerCase(),
        PRODUCT.sku,
        PRODUCT.stock,
        category.rows[0].id,
        brand.rows[0].id,
      ]
    )
  })
}
