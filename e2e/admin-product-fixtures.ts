import { withPool } from "./stock"

// Cleanup for e2e/admin-products.spec.ts (docs/specs/045-admin-products-
// create-edit). The spec creates products through the real form with SKUs that
// start with this prefix; they are removed before and after, in the database
// the app server uses, with the stock helper's production guard. Audit rows
// stay: the log refuses deletes by design. Not a spec itself.

export const SKU_PREFIX = "E2E-PRD-"

export async function removeE2eProducts() {
  await withPool(async (pool) => {
    await pool.query('DELETE FROM "Product" WHERE "sku" LIKE $1', [
      `${SKU_PREFIX}%`,
    ])
  })
}

// Straight to the database: a draft the form can then open
export async function readProduct(sku: string) {
  return withPool(async (pool) => {
    const { rows } = await pool.query<{
      price: number
      stock: number
      status: string
      editVersion: number
    }>(
      'SELECT "price", "stock", "status", "editVersion" FROM "Product" WHERE "sku" = $1',
      [sku]
    )
    return rows[0] ?? null
  })
}
