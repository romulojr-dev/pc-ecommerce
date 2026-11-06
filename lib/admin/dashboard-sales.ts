import { countsAsSale } from "@/lib/orders/sale-rules"
import type { OrderStatusName } from "@/lib/orders/timeline"

import { startOfManilaDay, startOfNextManilaDay } from "./manila-day"

// The dashboard's sales figures (docs/specs/048-admin-dashboard, B5, R1 to
// R3). Pure: no database. "Paid sales" count by `paidAt` and leave out
// cancelled and refunded orders (spec 042's `countsAsSale`); "orders placed"
// count by `createdAt`, any status.

export const LAST_DAYS = 30
const EIGHT_HOURS = 8 * 60 * 60 * 1000

export type DashboardWindows = {
  // 00:00 Asia/Manila today, and 00:00 tomorrow: Today is [todayStart, tomorrowStart)
  todayStart: Date
  tomorrowStart: Date
  // 00:00 Manila 29 days before today: Last 30 days is [last30Start, tomorrowStart)
  last30Start: Date
}

// The Manila calendar day of an instant, as YYYY-MM-DD (Manila has no DST)
function manilaDayOf(now: Date): string {
  return new Date(now.getTime() + EIGHT_HOURS).toISOString().slice(0, 10)
}

function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

// The one place the Manila boundaries are worked out. The database receives
// these instants as bound parameters and never converts a column's zone (R2).
export function dashboardWindows(now: Date): DashboardWindows {
  const today = manilaDayOf(now)
  return {
    todayStart: startOfManilaDay(today),
    tomorrowStart: startOfNextManilaDay(today),
    last30Start: startOfManilaDay(addDays(today, -(LAST_DAYS - 1))),
  }
}

export type SaleRow = {
  status: OrderStatusName
  createdAt: Date
  paidAt: Date | null
  // Centavos
  total: number
}

export type SalesFigures = {
  // Centavos: the sum of `total` of sale orders paid in the window
  paidSales: number
  // Orders placed in the window, any status
  placed: number
  // Sale orders paid in the window (the average's denominator)
  saleOrders: number
  // Centavos, or null with no sale orders
  averageOrder: number | null
}

export type SalesSummary = { today: SalesFigures; last30: SalesFigures }

// Nearest whole centavo, halves up, in integers: floor((2s + n) / (2n))
export function averageOrder(sales: number, count: number): number | null {
  if (count <= 0) return null
  return Math.floor((2 * sales + count) / (2 * count))
}

const within = (at: Date, from: Date, to: Date): boolean =>
  at.getTime() >= from.getTime() && at.getTime() < to.getTime()

function figures(rows: SaleRow[], from: Date, to: Date): SalesFigures {
  let paidSales = 0
  let saleOrders = 0
  let placed = 0
  for (const row of rows) {
    if (within(row.createdAt, from, to)) placed += 1
    if (row.paidAt && countsAsSale(row) && within(row.paidAt, from, to)) {
      paidSales += row.total
      saleOrders += 1
    }
  }
  return {
    paidSales,
    placed,
    saleOrders,
    averageOrder: averageOrder(paidSales, saleOrders),
  }
}

export function salesSummary(
  rows: SaleRow[],
  windows: DashboardWindows
): SalesSummary {
  return {
    today: figures(rows, windows.todayStart, windows.tomorrowStart),
    last30: figures(rows, windows.last30Start, windows.tomorrowStart),
  }
}
