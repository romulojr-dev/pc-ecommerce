import { Prisma } from "@/generated/prisma/client"

// The one definition of "due for release" in SQL (docs/specs/033-release-
// unpaid-orders, behavior 1; docs/specs/041-admin-orders-list-detail, D11):
// Pending payment or Pending confirmation, at or past `expiresAt`, and no
// payment that needs checking. The release's two queries and Admin's "Due for
// release" badge all use this fragment, so they can't disagree. `isDue`
// ([release-rules.ts]) states the same rule as a pure function and the tests
// check the two against each other. The order table must be aliased `o`.
export function dueOrderCondition(now: Date): Prisma.Sql {
  return Prisma.sql`o."status" IN ('PENDING_PAYMENT', 'PENDING_CONFIRMATION')
      AND o."expiresAt" <= ${now}
      AND NOT EXISTS (
        SELECT 1 FROM "Payment" p
        WHERE p."orderId" = o."id" AND p."problem" IS NOT NULL)`
}
