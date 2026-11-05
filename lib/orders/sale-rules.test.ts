import { describe, expect, it } from "vitest"

import { countsAsSale } from "./sale-rules"
import type { OrderStatusName } from "./timeline"

// docs/specs/042-admin-customers, E32 (the pure side; the SQL side is checked
// against it in sale-sql.db.test.ts)
const PAID_AT = new Date("2026-11-01T00:00:00Z")

describe("countsAsSale", () => {
  it.each<[OrderStatusName, boolean]>([
    ["PENDING_PAYMENT", true],
    ["PENDING_CONFIRMATION", true],
    ["PAID", true],
    ["COD_CONFIRMED", true],
    ["PROCESSING", true],
    ["SHIPPED", true],
    ["READY_FOR_PICKUP", true],
    ["DELIVERED", true],
    ["PICKED_UP", true],
    ["CANCELLED", false],
    ["REFUNDED", false],
  ])("%s with paidAt set: %s", (status, expected) => {
    expect(countsAsSale({ status, paidAt: PAID_AT })).toBe(expected)
  })

  it("never counts an order without paidAt", () => {
    expect(countsAsSale({ status: "PAID", paidAt: null })).toBe(false)
    expect(countsAsSale({ status: "DELIVERED", paidAt: null })).toBe(false)
  })
})
