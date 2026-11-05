import { Prisma } from "@/generated/prisma/client"
import { describe, expect, it } from "vitest"

import { db } from "@/test-support/db"

import { countsAsSale } from "./sale-rules"
import { saleOrderCondition } from "./sale-sql"
import type { OrderStatusName } from "./timeline"

// docs/specs/042-admin-customers, E32: the SQL condition and the pure
// predicate agree on every status with `paidAt` null and set. The orders table
// has CHECKs that forbid some of these pairs, so the combinations come from a
// VALUES list aliased `o`, the name the fragment expects.

const STATUSES: OrderStatusName[] = [
  "PENDING_PAYMENT",
  "PENDING_CONFIRMATION",
  "PAID",
  "COD_CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "READY_FOR_PICKUP",
  "DELIVERED",
  "PICKED_UP",
  "CANCELLED",
  "REFUNDED",
]
const PAID_AT = new Date("2026-11-01T00:00:00Z")

describe("E32: one definition of a sale", () => {
  it("SQL and pure agree on all 22 combinations", async () => {
    const cases = STATUSES.flatMap((status) => [
      { status, paidAt: null as Date | null },
      { status, paidAt: PAID_AT as Date | null },
    ])
    expect(cases).toHaveLength(22)
    const values = Prisma.join(
      cases.map(
        ({ status, paidAt }, i) =>
          Prisma.sql`(${i}::int, ${status}::text, ${paidAt}::timestamp)`
      )
    )
    const rows = await db.$queryRaw<{ n: number; sale: boolean }[]>`
      SELECT o."n", ${saleOrderCondition()} AS sale
      FROM (VALUES ${values}) AS o("n", "status", "paidAt")
      ORDER BY o."n"`
    expect(rows).toHaveLength(22)
    rows.forEach(({ n, sale }) => {
      expect(sale, JSON.stringify(cases[n])).toBe(countsAsSale(cases[n]))
    })
    expect(rows.filter((r) => r.sale)).toHaveLength(9)
  })
})
