import { Prisma } from "@/generated/prisma/client"

// The one definition of "needs payment review" in SQL (docs/specs/048-admin-
// dashboard, R6): a pending refund, or a payment with a `problem`. The
// dashboard's count uses it now; #111's review list will use it too, and adds
// "not yet reviewed" to both this and `needsReview` ([review-rules.ts]), which
// states the same rule as a pure function. The order table must be aliased `o`.
export function needsReviewCondition(): Prisma.Sql {
  return Prisma.sql`(o."refundRequired"
      OR EXISTS (
        SELECT 1 FROM "Payment" pay
        WHERE pay."orderId" = o."id" AND pay."problem" IS NOT NULL))`
}
