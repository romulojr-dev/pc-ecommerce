import { randomBytes } from "node:crypto"

import { withPool } from "./stock"

// Voucher rows in the database the app server uses, for the one state a test
// can't reach through the UI: a code that ends while a review is open
// (docs/specs/037-vouchers-at-checkout, X4). Same guard as the stock helper.
// Not a spec itself.

// A throwaway code, so a run never meets another run's row
export const throwawayCode = () =>
  `E2E${randomBytes(4).toString("hex").toUpperCase()}`

export async function insertVoucher(
  code: string,
  {
    type = "PERCENT",
    value = 10,
    minSpend = 0,
  }: { type?: "FIXED" | "PERCENT"; value?: number; minSpend?: number } = {}
) {
  await withPool(async (pool) => {
    await pool.query(
      `INSERT INTO "Voucher"
         ("id", "code", "type", "value", "minSpend", "startsAt", "updatedAt")
       VALUES ($1, $2, $3::"VoucherType", $4, $5,
         ($6::timestamptz AT TIME ZONE 'UTC'), now())`,
      [
        randomBytes(12).toString("hex"),
        code,
        type,
        value,
        minSpend,
        "2026-01-01T00:00:00+08:00",
      ]
    )
  })
}

// Prisma stores UTC in a column without a zone, and pg would send a Date in
// the machine's zone: send the instant as UTC text instead (as e2e/orders.ts)
export async function setVoucherEndsAt(code: string, endsAt: Date) {
  await withPool(async (pool) => {
    const { rowCount } = await pool.query(
      `UPDATE "Voucher" SET "endsAt" = ($1::timestamptz AT TIME ZONE 'UTC')
       WHERE "code" = $2`,
      [endsAt.toISOString(), code]
    )
    if (rowCount !== 1) {
      throw new Error(`Expected one voucher ${code}, changed ${rowCount}.`)
    }
  })
}

// Only a code no order holds can go (the foreign key is Restrict)
export async function deleteVoucher(code: string) {
  await withPool(async (pool) => {
    await pool.query('DELETE FROM "Voucher" WHERE "code" = $1', [code])
  })
}

export async function voucherUses(code: string): Promise<number> {
  return withPool(async (pool) => {
    const { rows } = await pool.query<{ usedCount: number }>(
      'SELECT "usedCount" FROM "Voucher" WHERE "code" = $1',
      [code]
    )
    if (rows.length !== 1) throw new Error(`No voucher ${code}.`)
    return rows[0].usedCount
  })
}
