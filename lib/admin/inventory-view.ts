import { dateTimeText } from "@/lib/orders/time"

import { INVENTORY_COPY } from "./inventory-copy"
import { MAX_STOCK } from "./inventory-input"

// What the Admin inventory screens say, as pure functions of the data
// (docs/specs/046-admin-inventory-adjustments, B4, B10, B14, D3, D16, D17).

export type StockLevel = "out" | "low" | "ok"

// The shelf count, not the shopper's label (D3): 0 is out, 1..lowStockAt is
// low (lowStockAt 0 turns "low" off, as getStockStatus does), the rest is ok.
// The SQL twin is lowStockCondition (lib/orders/low-stock-sql.ts).
export function stockLevel(product: {
  stock: number
  lowStockAt: number
}): StockLevel {
  if (product.stock <= 0) return "out"
  if (product.stock <= product.lowStockAt) return "low"
  return "ok"
}

export const levelLabel = (level: StockLevel): string | null =>
  level === "ok" ? null : INVENTORY_COPY.levels[level]

export const statusLabel = (status: string): string =>
  INVENTORY_COPY.statuses[status] ?? status

export const reasonLabel = (reason: string): string =>
  INVENTORY_COPY.reasons[reason] ?? reason

// +5 / −2 (a real minus sign)
export const signedChange = (change: number): string =>
  change > 0 ? `+${change}` : `−${Math.abs(change)}`

export type ReviewState = {
  after: number
  // Confirm is offered only when ok
  status: "ok" | "below-zero" | "above-ceiling"
  message: string | null
}

// The confirm step's figure, from the stock loaded with the page (B10)
export function reviewState(stock: number, delta: number): ReviewState {
  const after = stock + delta
  if (after < 0) {
    return {
      after,
      status: "below-zero",
      message: INVENTORY_COPY.adjust.belowZero,
    }
  }
  if (after > MAX_STOCK) {
    return {
      after,
      status: "above-ceiling",
      message: INVENTORY_COPY.adjust.aboveCeiling,
    }
  }
  return { after, status: "ok", message: null }
}

// "Stock 12 → 112. Received +100."
export function reviewText(
  stock: number,
  reason: string,
  delta: number
): string {
  return `Stock ${stock} → ${stock + delta}. ${reasonLabel(reason)} ${signedChange(delta)}.`
}

// The line after a saved adjustment; says so when the real stock before it
// differed from the figure the confirm step showed (D16)
export function resultText(result: {
  newStock: number
  delta: number
  shownStock: number
}): string {
  const was = result.newStock - result.delta
  return was === result.shownStock
    ? INVENTORY_COPY.success(result.newStock)
    : INVENTORY_COPY.successMoved(result.newStock, was, result.shownStock)
}

// The server's refusal, worded with the stock as it is now
export function refusalText(
  refusal: { kind: "too-low" | "too-high"; stock: number },
  delta: number
): string {
  return refusal.kind === "too-low"
    ? INVENTORY_COPY.tooLow(Math.abs(delta), refusal.stock)
    : INVENTORY_COPY.tooHigh(refusal.stock)
}

const dayParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  day: "numeric",
  month: "short",
  year: "numeric",
})

// "4 Nov 2026", in Philippine time
export function dayText(date: Date): string {
  const found: Record<string, string> = {}
  for (const { type, value } of dayParts.formatToParts(date)) {
    found[type] = value
  }
  return `${found.day} ${found.month} ${found.year}`
}

export const unrecordedText = (firstMovement: Date): string =>
  INVENTORY_COPY.history.unrecorded(dayText(firstMovement))

export type MovementInput = {
  id: string
  createdAt: Date
  reason: string
  change: number
  orderNumber: string | null
  actorName: string | null
  // Already masked for Demo by the query
  note: string | null
}

export type MovementCells = {
  id: string
  when: string
  reason: string
  change: string
  orderNumber: string | null
  by: string
  note: string
}

export function movementCells(row: MovementInput): MovementCells {
  const copy = INVENTORY_COPY.history
  return {
    id: row.id,
    when: dateTimeText(row.createdAt),
    reason: reasonLabel(row.reason),
    change: signedChange(row.change),
    orderNumber: row.orderNumber,
    by: row.actorName ?? copy.system,
    note: row.note ?? copy.none,
  }
}
