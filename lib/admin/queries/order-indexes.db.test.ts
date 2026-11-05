import { beforeAll, describe, expect, it } from "vitest"

import { db, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"

// docs/specs/041-admin-orders-list-detail, E29, R10: the list and its two
// filters read an index, not the whole table. The table is big enough, and
// analysed, for the planner to prefer an index.

const ROWS = 5_000
const START = new Date("2026-01-01T00:00:00Z").getTime()

async function plan(where: string): Promise<string> {
  const rows = await db.$queryRawUnsafe<Record<string, string>[]>(
    `EXPLAIN SELECT o."id" FROM "Order" o ${where}
     ORDER BY o."createdAt" DESC, o."id" DESC LIMIT 25`
  )
  return rows.map((row) => row["QUERY PLAN"]).join("\n")
}

beforeAll(async () => {
  await resetCatalog()
  const data = Array.from({ length: ROWS }, (_, i) => {
    const createdAt = new Date(START + i * 60_000)
    // About 2% cancelled and 2% cash, so a filter is selective
    if (i % 50 === 0) {
      return orderData({
        createdAt,
        status: "CANCELLED",
        cancelledAt: createdAt,
        cancelReason: "EXPIRED",
      })
    }
    if (i % 50 === 1) {
      return orderData({
        createdAt,
        paymentOption: "COD",
        status: "PENDING_CONFIRMATION",
      })
    }
    return orderData({ createdAt })
  })
  await db.order.createMany({
    data: data as NonNullable<
      Parameters<typeof db.order.createMany>[0]
    >["data"],
  })
  await db.$executeRawUnsafe(`ANALYZE "Order"`)
}, 60_000)

describe("E29: the order list reads its indexes", () => {
  it("the unfiltered list uses the newest-first index", async () => {
    const text = await plan("")
    expect(text).toContain("Order_createdAt_id_idx")
    expect(text).not.toMatch(/Seq Scan/)
  })

  it("the status filter uses the status index", async () => {
    const text = await plan(`WHERE o."status" = 'CANCELLED'`)
    expect(text).toContain("Order_status_createdAt_id_idx")
    expect(text).not.toMatch(/Seq Scan/)
  })

  it("the payment filter uses the payment index", async () => {
    const text = await plan(`WHERE o."paymentOption" = 'COD'`)
    expect(text).toContain("Order_paymentOption_createdAt_id_idx")
    expect(text).not.toMatch(/Seq Scan/)
  })
})
