import { Prisma } from "@/generated/prisma/client"

import type { LevelFilter } from "./inventory-params"

// The one definition of "low stock" and "out of stock" in SQL (docs/specs/046-
// admin-inventory-adjustments, B5, D4, R17): ACTIVE products only (a draft or
// retired product is not for sale, so it isn't "low"); out is 0, low is 1 up
// to `lowStockAt` (0 turns low off), and "needs restocking" is both. Admin's
// Inventory list uses it now, and the dashboard's low-stock list (#120) reuses
// it. `stockLevel` (inventory-view.ts) states the same rule as a pure function
// and low-stock-sql.db.test.ts checks the two against each other. The product
// table must be aliased `p`.
export function lowStockCondition(level: LevelFilter): Prisma.Sql {
  switch (level) {
    case "out":
      return Prisma.sql`p."status" = 'ACTIVE' AND p."stock" = 0`
    case "low":
      return Prisma.sql`p."status" = 'ACTIVE' AND p."stock" >= 1 AND p."stock" <= p."lowStockAt"`
    case "restock":
      return Prisma.sql`p."status" = 'ACTIVE' AND (p."stock" = 0 OR (p."stock" >= 1 AND p."stock" <= p."lowStockAt"))`
  }
}
