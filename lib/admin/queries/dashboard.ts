import "server-only"

import { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import { needsReviewCondition } from "@/lib/orders/review-sql"

import {
  dashboardWindows,
  type DashboardWindows,
  type SalesSummary,
  salesSummary,
} from "../dashboard-sales"
import { lowStockCondition } from "../low-stock-sql"
import type { AdminRole } from "../permissions"
import { assertCan } from "./guard"
import {
  dueAmong,
  listSelect,
  type OrderListRow,
  toOrderListRow,
} from "./orders"

// What the dashboard shows (docs/specs/048-admin-dashboard, B5 to B8, R1 to
// R9). Named fields only, a role check of its own beside the page's. Never
// cached: the recent orders differ by role. The aggregates and the restocking
// list hold no customer field, so every role sees the true figures; only the
// recent orders' customer name is masked (for Demo), by `toOrderListRow`.

export const RESTOCK_LIMIT = 10
export const RECENT_LIMIT = 5

export type RestockItem = {
  id: string
  name: string
  sku: string
  stock: number
}

export type Dashboard = {
  sales: SalesSummary
  restock: { total: number; items: RestockItem[] }
  recent: OrderListRow[]
  needsReview: number
}

// The window's rows: four fields each, for orders placed or paid in it. The
// instants are bound parameters; no column is converted to another zone (R2).
export async function loadSaleRows(windows: DashboardWindows) {
  return db.order.findMany({
    where: {
      OR: [
        { createdAt: { gte: windows.last30Start, lt: windows.tomorrowStart } },
        { paidAt: { gte: windows.last30Start, lt: windows.tomorrowStart } },
      ],
    },
    select: { status: true, createdAt: true, paidAt: true, total: true },
  })
}

async function loadRestock() {
  const condition = lowStockCondition("restock")
  const [{ n }] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM "Product" p WHERE ${condition}`
  const items = await db.$queryRaw<RestockItem[]>`
    SELECT p."id", p."name", p."sku", p."stock"
    FROM "Product" p
    WHERE ${condition}
    ORDER BY p."stock" ASC, p."name" ASC, p."id" ASC
    LIMIT ${RESTOCK_LIMIT}`
  return { total: Number(n), items }
}

async function loadRecent(role: AdminRole, now: Date) {
  const rows = await db.order.findMany({
    select: listSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: RECENT_LIMIT,
  })
  const due = await dueAmong(
    rows.map(({ id }) => id),
    now
  )
  return rows.map((row) => toOrderListRow(role, row, due.has(row.id)))
}

async function countNeedsReview() {
  const [{ n }] = await db.$queryRaw<{ n: bigint }[]>(
    Prisma.sql`SELECT count(*) AS n FROM "Order" o WHERE ${needsReviewCondition()}`
  )
  return Number(n)
}

export async function getDashboard(
  role: AdminRole,
  now: Date
): Promise<Dashboard> {
  assertCan(role, "dashboard.view")
  const windows = dashboardWindows(now)
  const [saleRows, restock, recent, needsReview] = await Promise.all([
    loadSaleRows(windows),
    loadRestock(),
    loadRecent(role, now),
    countNeedsReview(),
  ])
  return {
    sales: salesSummary(saleRows, windows),
    restock,
    recent,
    needsReview,
  }
}
