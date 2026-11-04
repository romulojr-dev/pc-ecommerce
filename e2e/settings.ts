import { withPool } from "./stock"

// Changes the cash-on-delivery limit in the database the app server uses, for
// the state the UI can't reach (docs/specs/038-cash-on-delivery, X4): a
// limit low enough that a small order is over it. Same guard as the stock
// helper. Specs restore the value in a `finally`. Not a spec itself.
export async function readCodMaxTotal(): Promise<number | null> {
  return withPool(async (pool) => {
    const { rows } = await pool.query<{ codMaxTotal: number | null }>(
      'SELECT "codMaxTotal" FROM "StoreSettings" WHERE "id" = 1'
    )
    if (rows.length !== 1) throw new Error("No store settings row. Seed first.")
    return rows[0].codMaxTotal
  })
}

export async function setCodMaxTotal(centavos: number | null) {
  await withPool(async (pool) => {
    const { rowCount } = await pool.query(
      'UPDATE "StoreSettings" SET "codMaxTotal" = $1 WHERE "id" = 1',
      [centavos]
    )
    if (rowCount !== 1) throw new Error("No store settings row. Seed first.")
  })
}
