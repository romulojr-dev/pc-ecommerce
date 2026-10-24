// Stock statuses shown to shoppers (PRD FR-8). "Pre-order" needs a schema
// field first; it comes with the Catalog epic (docs/specs/004-product-list).
export type StockStatus = "in-stock" | "low-stock" | "out-of-stock"

export const stockStatusLabel: Record<StockStatus, string> = {
  "in-stock": "In stock",
  "low-stock": "Low stock",
  "out-of-stock": "Out of stock",
}

// "Low stock" is 1..lowStockAt units left, so lowStockAt: 0 turns it off
export function getStockStatus(product: {
  stock: number
  lowStockAt: number
}): StockStatus {
  if (product.stock <= 0) return "out-of-stock"
  if (product.stock <= product.lowStockAt) return "low-stock"
  return "in-stock"
}
