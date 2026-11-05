import { Prisma } from "@/generated/prisma/client"

// The one definition of "counts as a sale" in SQL (docs/specs/042-admin-
// customers, R4): `paidAt` set and the status neither Cancelled nor Refunded.
// `countsAsSale` ([sale-rules.ts]) is the pure statement of the same rule; the
// tests check the two against each other. The order table must be aliased `o`.
export function saleOrderCondition(): Prisma.Sql {
  return Prisma.sql`(o."paidAt" IS NOT NULL
      AND o."status" NOT IN ('CANCELLED', 'REFUNDED'))`
}
