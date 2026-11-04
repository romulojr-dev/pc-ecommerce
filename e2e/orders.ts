import { randomBytes } from "node:crypto"

import { recipientHash } from "../lib/email/recipient"
import { signOrderLink } from "../lib/orders/signed-link"
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
         AND o."status" IN ('PENDING_PAYMENT', 'PENDING_CONFIRMATION')
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

// A signed `view` link for an order, minted with the same secret the app
// server signs with (docs/specs/035-email-foundation-signed-links), so the
// E2E can open what an email will carry. Needs ORDER_LINK_SECRET in the
// environment (.env.local locally, the job's variables in CI).
export function viewLinkQuery(
  orderNumber: string,
  { expiresInSeconds = 90 * 86_400 }: { expiresInSeconds?: number } = {}
): string {
  const secret = process.env.ORDER_LINK_SECRET
  if (!secret) throw new Error("ORDER_LINK_SECRET is not set.")
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds
  const { sig, p } = signOrderLink(secret, orderNumber, "view", exp)
  return `sig=${sig}&exp=${exp}&p=${p}`
}

// Writes an outbox row for an order, as a trigger's transaction will (#93):
// the recipient hash is of the order's own address
export async function enqueueEmailFor(
  orderNumber: string,
  type: "ORDER_PLACED" | "PAYMENT_RECEIVED" | "ORDER_CANCELLED" | "COD_CONFIRM"
) {
  await withPool(async (pool) => {
    const { rows } = await pool.query<{ id: string; guestEmail: string }>(
      'SELECT "id", "guestEmail" FROM "Order" WHERE "orderNumber" = $1',
      [orderNumber]
    )
    if (rows.length !== 1) throw new Error(`No order ${orderNumber}.`)
    await pool.query(
      `INSERT INTO "EmailOutbox" ("id", "orderId", "type", "recipientHash")
       VALUES ($1, $2, $3::"EmailType", $4)`,
      [
        `e2e${randomBytes(10).toString("hex")}`,
        rows[0].id,
        type,
        recipientHash(rows[0].guestEmail),
      ]
    )
  })
}

export async function outboxFor(orderNumber: string) {
  return withPool(async (pool) => {
    const { rows } = await pool.query<{
      type: string
      status: string
      attempts: number
      lastErrorCode: string | null
    }>(
      `SELECT e."type"::text AS "type", e."status"::text AS "status",
         e."attempts", e."lastErrorCode"
       FROM "EmailOutbox" e JOIN "Order" o ON o."id" = e."orderId"
       WHERE o."orderNumber" = $1 ORDER BY e."createdAt"`,
      [orderNumber]
    )
    return rows
  })
}

// The emails the fake transport recorded for an address, oldest first
// (docs/specs/036-order-emails, X1–X4). Test addresses are unique per test:
// the sender's cap is five emails per recipient per day (spec 035).
export async function fakeEmailsFor(address: string) {
  return withPool(async (pool) => {
    const { rows } = await pool.query<{
      subject: string
      html: string
      text: string
    }>(
      `SELECT "subject", "html", "text" FROM "FakeEmail"
       WHERE "to" = $1 ORDER BY "createdAt", "id"`,
      [address]
    )
    return rows
  })
}

// The path and query of the first order link in an email's text, for
// `page.goto`: the email's host is the site URL, the browser's is the server
// under test
export function orderLinkPath(text: string): string {
  const match = /https?:\/\/[^\s/]+(\/orders\/\S+)/.exec(text)
  if (!match) throw new Error("No order link in the email.")
  return match[1]
}
