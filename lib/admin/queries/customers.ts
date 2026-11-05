import "server-only"

import { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import { normalizeRecipient } from "@/lib/email/recipient"
import { customerKeySql } from "@/lib/orders/customer-key-sql"
import { saleOrderCondition } from "@/lib/orders/sale-sql"

import {
  CUSTOMERS_PAGE_SIZE,
  type CustomerParams,
  customerPageCount,
  resolveCustomerPage,
} from "../customers-params"
import { demoKeyRank, rankKey } from "../customers-view"
import { type Masked, maskEmail, maskName } from "../mask"
import {
  type CustomerQuery,
  customerQueryOf,
  hasCustomerTerm,
} from "../orders-params"
import { type AdminRole, can } from "../permissions"
import { assertCan, type Denied, denied } from "./guard"

// Customers as Admin lists them (docs/specs/042-admin-customers; masking:
// docs/specs/040-admin-permissions-audit-masking, R17). There is no customer
// table: a customer is the normalized guest email on orders (`customerKeySql`,
// the same rule as the email cap). The grouping, the paging and the sums run in
// SQL over every order, so nothing is cut off. A Demo row carries no key that
// could reveal the email: its id is its rank in the whole list ("c1", "c26").
// Selects named fields only; the token hash, idempotency key, cart hash,
// recipient hash and mobile number are not returned.

// A Demo view has no field that can hold the real name or email (spec 040 R15)
export type CustomerContact =
  | { masked: false; name: string; email: string }
  | { masked: true; name: Masked; email: Masked }

export type CustomerRow = {
  // Owner and Staff: the normalized email, the key of "View orders". Demo: the
  // rank key, "c1", "c2", ...
  id: string
  // The newest order's name and email, as stored
  contact: CustomerContact
  // Every order the customer placed, whatever its status
  orderCount: number
  // Centavos: the grand totals of the orders that count as a sale
  totalSpent: number
  // The newest order, of any status
  lastOrderAt: Date
}

export type CustomerList = {
  ok: true
  rows: CustomerRow[]
  total: number
  // The page actually read (a request past the last page lands on the last)
  page: number
  pageCount: number
}

// '%', '_' and the escape character itself are text in a search term
const likeOf = (text: string) => `%${text.replace(/[\\%_]/g, "\\$&")}%`

// All customers, ranked: most recent last order first, key as the tiebreak.
// `matched` is the search; the rank is over every customer, search or not.
function rankedCustomers(term: CustomerQuery | null): Prisma.Sql {
  const matched = term
    ? Prisma.sql`bool_or(
        x."contactName" ILIKE ${likeOf(term.text)}
        OR x."guestEmail" ILIKE ${likeOf(term.text)}
        ${
          term.mobileDigits
            ? Prisma.sql`OR x."contactMobile" LIKE ${`%${term.mobileDigits}%`}`
            : Prisma.empty
        })`
    : Prisma.sql`true`
  return Prisma.sql`
    WITH x AS (
      SELECT o."id", o."createdAt", o."total", o."guestEmail",
        o."contactName", o."contactMobile",
        ${customerKeySql()} AS "key",
        ${saleOrderCondition()} AS "sale"
      FROM "Order" o
    ), g AS (
      SELECT x."key",
        count(*)::int AS "orderCount",
        COALESCE(SUM(x."total") FILTER (WHERE x."sale"), 0)::bigint
          AS "totalSpent",
        max(x."createdAt") AS "lastOrderAt",
        (array_agg(x."contactName" ORDER BY x."createdAt" DESC, x."id" DESC))[1]
          AS "name",
        (array_agg(x."guestEmail" ORDER BY x."createdAt" DESC, x."id" DESC))[1]
          AS "email",
        ${matched} AS "matched"
      FROM x GROUP BY x."key"
    ), r AS (
      SELECT g.*,
        row_number() OVER (ORDER BY g."lastOrderAt" DESC, g."key" ASC)::int
          AS "rank"
      FROM g
    )`
}

type RawCustomer = {
  key: string
  orderCount: number
  totalSpent: bigint
  lastOrderAt: Date
  name: string
  email: string
  rank: number
}

// A customer term as Demo is refused before any query runs (R9): searching
// would confirm who is a customer behind the masking
export async function listCustomers(
  role: AdminRole,
  params: CustomerParams
): Promise<CustomerList | Denied> {
  assertCan(role, "customers.view")
  if (
    hasCustomerTerm(params.customer) &&
    !can(role, "orders.search-customer")
  ) {
    return denied(role, "orders.search-customer")
  }
  const ranked = rankedCustomers(customerQueryOf(params.customer))
  const [{ n: total }] = await db.$queryRaw<{ n: number }[]>`
    ${ranked} SELECT count(*)::int AS n FROM r WHERE r."matched"`
  const page = resolveCustomerPage(params.page, total)
  const rows = await db.$queryRaw<RawCustomer[]>`
    ${ranked}
    SELECT r."key", r."orderCount", r."totalSpent", r."lastOrderAt", r."name",
      r."email", r."rank"
    FROM r WHERE r."matched"
    ORDER BY r."rank"
    LIMIT ${CUSTOMERS_PAGE_SIZE} OFFSET ${(page - 1) * CUSTOMERS_PAGE_SIZE}`
  return {
    ok: true,
    total,
    page,
    pageCount: customerPageCount(total),
    rows: rows.map((row) => ({
      id: role === "demo" ? rankKey(row.rank) : row.key,
      contact: contactOf(role, row.name, row.email),
      orderCount: row.orderCount,
      totalSpent: Number(row.totalSpent),
      lastOrderAt: row.lastOrderAt,
    })),
  }
}

function contactOf(
  role: AdminRole,
  name: string,
  email: string
): CustomerContact {
  return role === "demo"
    ? { masked: true, name: maskName(name), email: maskEmail(email) }
    : { masked: false, name, email }
}

// ---- Following a customer into the order list ----

// The customer a `buyer` key names. Owner and Staff pass the normalized email;
// Demo passes a rank key, which is resolved here on every request (R7). Any
// other Demo value names nobody and runs no lookup (R8), so Demo cannot test
// whether an address is a customer.
async function customerKeyOf(
  role: AdminRole,
  buyer: string
): Promise<string | null> {
  if (role !== "demo") {
    const key = normalizeRecipient(buyer)
    return key === "" ? null : key
  }
  const rank = demoKeyRank(buyer)
  if (rank === null) return null
  const rows = await db.$queryRaw<{ key: string }[]>`
    ${rankedCustomers(null)} SELECT r."key" FROM r WHERE r."rank" = ${rank}`
  return rows[0]?.key ?? null
}

export type BuyerOrders = {
  // The customer's order ids, newest first; empty for an unknown customer
  orderIds: string[]
  // The newest order's name (masked for Demo); null for an unknown customer
  name: { masked: false; name: string } | { masked: true; name: Masked } | null
}

export async function findBuyerOrders(
  role: AdminRole,
  buyer: string
): Promise<BuyerOrders> {
  assertCan(role, "customers.view")
  const key = await customerKeyOf(role, buyer)
  if (key === null) return { orderIds: [], name: null }
  const orders = await db.$queryRaw<{ id: string; contactName: string }[]>`
    SELECT o."id", o."contactName" FROM "Order" o
    WHERE ${customerKeySql()} = ${key}
    ORDER BY o."createdAt" DESC, o."id" DESC`
  if (orders.length === 0) return { orderIds: [], name: null }
  const { contactName } = orders[0]
  return {
    orderIds: orders.map(({ id }) => id),
    name:
      role === "demo"
        ? { masked: true, name: maskName(contactName) }
        : { masked: false, name: contactName },
  }
}

// The key the order detail links to: the normalized email, or for Demo the
// customer's rank key, never the email (B15). Null for a role that can't open
// Customers.
export async function customerLinkKey(
  role: AdminRole,
  guestEmail: string
): Promise<string | null> {
  if (!can(role, "customers.view")) return null
  const key = normalizeRecipient(guestEmail)
  if (role !== "demo") return key
  const rows = await db.$queryRaw<{ rank: number }[]>`
    ${rankedCustomers(null)} SELECT r."rank" FROM r WHERE r."key" = ${key}`
  return rows[0] ? rankKey(rows[0].rank) : null
}
