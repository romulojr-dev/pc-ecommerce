import { Pool } from "pg"

import { assertResetAllowed, ResetRefusedError } from "../lib/reset-guard"

// Changes a product's stock in the database the app server uses, for the
// specs that need a state the UI can't reach (docs/specs/027-cart-stock-flags,
// D12): every add is capped, so a cart over its stock only happens when stock
// drops afterwards. Not a spec itself: Playwright only runs *.spec.ts files.
//
// Test tooling, not app code, so it reads process.env directly. It refuses to
// run on production (the catalog reset's guard). Locally that needs
// PRODUCTION_DATABASE_HOST in .env.local; CI's throwaway database doesn't.
// Specs set a known stock first and restore it in a `finally`, because
// `pnpm db:seed` keeps the stock of products that exist.
// The guard and a connection to the app's database, for the helpers below
async function withPool<T>(run: (pool: Pool) => Promise<T>): Promise<T> {
  try {
    assertResetAllowed(process.env, { requireProductionHost: !process.env.CI })
  } catch (error) {
    if (error instanceof ResetRefusedError) {
      throw new Error(`The E2E stock helper won't run. ${error.message}`)
    }
    throw error
  }
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is not set, so the E2E can't change stock.")
  }

  const pool = new Pool({ connectionString: url })
  try {
    return await run(pool)
  } finally {
    await pool.end()
  }
}

export async function setStock(productName: string, stock: number) {
  await withPool(async (pool) => {
    const { rowCount } = await pool.query(
      'UPDATE "Product" SET "stock" = $1 WHERE "name" = $2',
      [stock, productName]
    )
    if (rowCount !== 1) {
      throw new Error(
        `Expected one product named ${productName}, changed ${rowCount}.`
      )
    }
  })
}

// A product's stock now, for the specs that place orders
// (docs/specs/030-place-an-order)
export async function readStock(productName: string): Promise<number> {
  return withPool(async (pool) => {
    const { rows } = await pool.query<{ stock: number }>(
      'SELECT "stock" FROM "Product" WHERE "name" = $1',
      [productName]
    )
    if (rows.length !== 1) {
      throw new Error(
        `Expected one product named ${productName}, found ${rows.length}.`
      )
    }
    return rows[0].stock
  })
}
