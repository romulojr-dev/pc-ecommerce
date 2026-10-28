// Stock statuses shown to shoppers (PRD FR-8, docs/specs/010-product-page)
export type StockStatus =
  "in-stock" | "low-stock" | "out-of-stock" | "pre-order"

export const stockStatusLabel: Record<StockStatus, string> = {
  "in-stock": "In stock",
  "low-stock": "Low stock",
  "out-of-stock": "Out of stock",
  "pre-order": "Pre-order",
}

// Dates are "YYYY-MM-DD" strings, so they compare as strings. "Low stock" is
// 1..lowStockAt units left, so lowStockAt: 0 turns it off. A pre-order's
// stock is its allocation: none left is out of stock. A ship date that is
// today or earlier ends the pre-order, so the normal status applies.
export function getStockStatus(
  product: {
    stock: number
    lowStockAt: number
    preorderShipsOn: string | null
  },
  today: string
): StockStatus {
  if (product.stock <= 0) return "out-of-stock"
  if (product.preorderShipsOn && product.preorderShipsOn > today) {
    return "pre-order"
  }
  if (product.stock <= product.lowStockAt) return "low-stock"
  return "in-stock"
}

// Can be bought now: the inStock filter's meaning (docs/specs/012-common-
// filters). Only buyable parts can be added to a build
// (docs/specs/020-builder-page, Rules › Buyable).
export function isBuyable(status: StockStatus): boolean {
  return status === "in-stock" || status === "low-stock"
}

// en-CA formats dates as YYYY-MM-DD
const manilaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
})

// Today's date in the Philippines, as "YYYY-MM-DD"
export function manilaToday(now: Date = new Date()): string {
  return manilaDate.format(now)
}

// A quantity from 1 to max (the units available); anything else is pulled
// into range, and a value that isn't a number becomes 1
export function clampQuantity(value: number, max: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(Math.max(Math.trunc(value), 1), max)
}
