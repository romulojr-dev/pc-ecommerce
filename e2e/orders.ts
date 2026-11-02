import { withPool } from "./stock"

// Moves an order's deadline in the database the app server uses, for the one
// state a test can't wait for: an unpaid order past expiresAt
// (docs/specs/033-release-unpaid-orders, X1, X2). Same guard as the stock
// helper. Not a spec itself.
export async function setExpiresAt(orderNumber: string, expiresAt: Date) {
  await withPool(async (pool) => {
    const { rowCount } = await pool.query(
      // Prisma stores UTC in a column without a zone, and pg would send a
      // Date in the machine's zone: send the instant as UTC text instead
      `UPDATE "Order" SET "expiresAt" = ($1::timestamptz AT TIME ZONE 'UTC')
       WHERE "orderNumber" = $2`,
      [expiresAt.toISOString(), orderNumber]
    )
    if (rowCount !== 1) {
      throw new Error(`Expected one order ${orderNumber}, changed ${rowCount}.`)
    }
  })
}

// How many unpaid orders past their deadline still hold a product: what a
// sweep should bring to 0. A run that failed halfway leaves one behind, and
// releasing it later would change the stock a spec counts on.
export async function dueOrdersHolding(productName: string): Promise<number> {
  return withPool(async (pool) => {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(DISTINCT o."id") AS "count"
       FROM "Order" o
       JOIN "OrderItem" i ON i."orderId" = o."id"
       JOIN "Product" p ON p."id" = i."productId"
       WHERE p."name" = $1
         AND o."status" = 'PENDING_PAYMENT'
         AND o."expiresAt" <= (now() AT TIME ZONE 'UTC')`,
      [productName]
    )
    return Number(rows[0].count)
  })
}

// How many of an order's payments are open (Pending): one at most, whatever
// the clicks (docs/specs/034-start-payment-outside-transaction, W4)
export async function openPayments(orderNumber: string): Promise<number> {
  return withPool(async (pool) => {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) AS "count"
       FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId"
       WHERE o."orderNumber" = $1 AND p."status" = 'PENDING'`,
      [orderNumber]
    )
    return Number(rows[0].count)
  })
}
