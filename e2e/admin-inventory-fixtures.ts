import { ACCOUNTS } from "./accounts"
import { withPool } from "./stock"

// Throwaway products for e2e/admin-inventory.spec.ts (docs/specs/046-admin-
// inventory-adjustments). Inserted directly, in the database the app server
// uses, with the stock helper's production guard, under a SKU prefix, and
// removed (with their movements) before and after. Audit rows stay: the log
// refuses deletes by design. Not a spec itself.

export const SKU_PREFIX = "E2E-INV-"

type Fixture = { sku: string; name: string; stock: number; lowStockAt: number }

// Plenty of stock, threshold 5
export const ALPHA: Fixture = {
  sku: `${SKU_PREFIX}ALPHA`,
  name: "E2E Inventory Alpha",
  stock: 12,
  lowStockAt: 5,
}
// Low stock (3 of 5)
export const BETA: Fixture = {
  sku: `${SKU_PREFIX}BETA`,
  name: "E2E Inventory Beta",
  stock: 3,
  lowStockAt: 5,
}
// Out of stock
export const GAMMA: Fixture = {
  sku: `${SKU_PREFIX}GAMMA`,
  name: "E2E Inventory Gamma",
  stock: 0,
  lowStockAt: 5,
}

// A staff note Demo must never see
export const NOTE = "E2E shelf recount, row 4"

export async function removeInventoryFixtures() {
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

export async function insertInventoryFixtures() {
  await removeInventoryFixtures()
  await withPool(async (pool) => {
    const category = await pool.query<{ id: string }>(
      'SELECT "id" FROM "Category" ORDER BY "slug" LIMIT 1'
    )
    const brand = await pool.query<{ id: string }>(
      'SELECT "id" FROM "Brand" ORDER BY "slug" LIMIT 1'
    )
    const staff = await pool.query<{ id: string }>(
      'SELECT "id" FROM "User" WHERE "email" = $1',
      [ACCOUNTS.staff.email]
    )
    if (!category.rows[0] || !brand.rows[0] || !staff.rows[0]) {
      throw new Error(
        "The inventory E2E needs a seeded catalog and the E2E staff account (pnpm db:seed, pnpm staff:create)."
      )
    }
    for (const fixture of [ALPHA, BETA, GAMMA]) {
      await pool.query(
        `INSERT INTO "Product"
           ("id", "name", "slug", "sku", "price", "stock", "lowStockAt",
            "status", "specs", "weightGrams", "categoryId", "brandId",
            "updatedAt")
         VALUES ($1, $2, $3, $4, 100000, $5, $6, 'ACTIVE', '{}', 100,
                 $7, $8, now())`,
        [
          `e2einv-${fixture.sku.slice(SKU_PREFIX.length).toLowerCase()}`,
          fixture.name,
          fixture.sku.toLowerCase(),
          fixture.sku,
          fixture.stock,
          fixture.lowStockAt,
          category.rows[0].id,
          brand.rows[0].id,
        ]
      )
    }
    // One staff correction with a note on Alpha, so there is a note to hide
    await pool.query(
      `INSERT INTO "StockMovement"
         ("id", "productId", "change", "reason", "actorId", "note")
       VALUES ('e2einv-movement-1', 'e2einv-alpha', 1, 'CORRECTION', $1, $2)`,
      [staff.rows[0].id, NOTE]
    )
  })
}

export async function readFixture(sku: string) {
  return withPool(async (pool) => {
    const { rows } = await pool.query<{
      id: string
      stock: number
      lowStockAt: number
      editVersion: number
    }>(
      'SELECT "id", "stock", "lowStockAt", "editVersion" FROM "Product" WHERE "sku" = $1',
      [sku]
    )
    return rows[0] ?? null
  })
}

// What an order does behind the page's back
export async function setFixtureStock(sku: string, stock: number) {
  await withPool(async (pool) => {
    await pool.query('UPDATE "Product" SET "stock" = $1 WHERE "sku" = $2', [
      stock,
      sku,
    ])
  })
}

export async function movementCount(sku: string): Promise<number> {
  return withPool(async (pool) => {
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM "StockMovement" m
         JOIN "Product" p ON p."id" = m."productId" WHERE p."sku" = $1`,
      [sku]
    )
    return Number(rows[0].n)
  })
}
