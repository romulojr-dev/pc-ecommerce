import { describe, expect, test } from "vitest"

import {
  averageOrder,
  dashboardWindows,
  type SaleRow,
  salesSummary,
} from "./dashboard-sales"

// docs/specs/048-admin-dashboard: E1 to E14, E27 to E29, R1 to R3

const iso = (text: string) => new Date(text)
// Now = 2026-11-06 15:00 Manila
const NOW = iso("2026-11-06T07:00:00Z")
const W = dashboardWindows(NOW)

const row = (over: Partial<SaleRow>): SaleRow => ({
  status: "PAID",
  createdAt: iso("2026-11-06T02:00:00Z"),
  paidAt: iso("2026-11-06T03:00:00Z"),
  total: 1_000_000,
  ...over,
})

describe("dashboardWindows", () => {
  test("23:59:59 Manila is still today (E27)", () => {
    const w = dashboardWindows(iso("2026-11-06T15:59:59Z"))
    expect(w.todayStart.toISOString()).toBe("2026-11-05T16:00:00.000Z")
    expect(w.tomorrowStart.toISOString()).toBe("2026-11-06T16:00:00.000Z")
    expect(w.last30Start.toISOString()).toBe("2026-10-07T16:00:00.000Z")
  })

  test("00:00:00 Manila is the next day (E28)", () => {
    const w = dashboardWindows(iso("2026-11-06T16:00:00Z"))
    expect(w.todayStart.toISOString()).toBe("2026-11-06T16:00:00.000Z")
    expect(w.tomorrowStart.toISOString()).toBe("2026-11-07T16:00:00.000Z")
  })

  test("UTC midnight is 08:00 Manila, the same Manila day (E29)", () => {
    const w = dashboardWindows(iso("2026-11-06T00:00:00Z"))
    expect(w.todayStart.toISOString()).toBe("2026-11-05T16:00:00.000Z")
    expect(w.tomorrowStart.toISOString()).toBe("2026-11-06T16:00:00.000Z")
  })

  test("30 days cross a month and a year end", () => {
    const w = dashboardWindows(iso("2027-01-10T04:00:00Z"))
    expect(w.last30Start.toISOString()).toBe("2026-12-11T16:00:00.000Z")
    const leap = dashboardWindows(iso("2028-03-01T04:00:00Z"))
    expect(leap.last30Start.toISOString()).toBe("2028-01-31T16:00:00.000Z")
  })
})

describe("averageOrder", () => {
  test("₱100.00 over 3 is ₱33.33 (E11)", () => {
    expect(averageOrder(10_000, 3)).toBe(3333)
  })
  test("halves round up (E11b)", () => {
    expect(averageOrder(1_000_100, 2)).toBe(500_050)
    expect(averageOrder(1_000_001, 2)).toBe(500_001)
    expect(averageOrder(5, 2)).toBe(3)
    expect(averageOrder(7, 2)).toBe(4)
    expect(averageOrder(2, 3)).toBe(1)
  })
  test("no sale orders gives null", () => {
    expect(averageOrder(0, 0)).toBeNull()
  })
})

describe("salesSummary", () => {
  test("three paid orders today (E1)", () => {
    const rows = [1_000_000, 2_000_000, 3_000_000].map((total) =>
      row({ total })
    )
    const { today } = salesSummary(rows, W)
    expect(today).toEqual({
      paidSales: 6_000_000,
      placed: 3,
      saleOrders: 3,
      averageOrder: 2_000_000,
    })
  })

  test("placed yesterday, paid today: sales but not placed today (E2)", () => {
    const r = row({
      createdAt: iso("2026-11-05T14:00:00Z"),
      paidAt: iso("2026-11-05T17:00:00Z"),
    })
    const s = salesSummary([r], W)
    expect(s.today.paidSales).toBe(1_000_000)
    expect(s.today.placed).toBe(0)
    expect(s.last30.placed).toBe(1)
  })

  test("Manila midnight is the boundary, not UTC (E3, E4)", () => {
    const before = row({ paidAt: iso("2026-11-05T15:59:59.999Z") })
    const after = row({ paidAt: iso("2026-11-05T16:00:00Z") })
    expect(salesSummary([before], W).today.saleOrders).toBe(0)
    expect(salesSummary([after], W).today.saleOrders).toBe(1)
    const late = row({ paidAt: iso("2026-11-05T20:00:00Z") })
    expect(salesSummary([late], W).today.saleOrders).toBe(1)
  })

  test("the oldest day of the 30 (E5)", () => {
    const first = row({
      createdAt: iso("2026-10-01T00:00:00Z"),
      paidAt: iso("2026-10-07T16:00:00Z"),
    })
    const out = row({
      createdAt: iso("2026-10-01T00:00:00Z"),
      paidAt: iso("2026-10-07T15:59:00Z"),
    })
    const s = salesSummary([first, out], W)
    expect(s.last30.saleOrders).toBe(1)
    expect(s.today.saleOrders).toBe(0)
  })

  test("a cash order counts when delivered (E6)", () => {
    const r = row({
      status: "DELIVERED",
      createdAt: iso("2026-10-20T02:00:00Z"),
      paidAt: iso("2026-11-06T03:00:00Z"),
    })
    const s = salesSummary([r], W)
    expect(s.today.paidSales).toBe(1_000_000)
    expect(s.today.placed).toBe(0)
    expect(s.last30.placed).toBe(1)
  })

  test("unpaid, cancelled and refunded orders are not sales (E7 to E10)", () => {
    const rows = [
      row({ status: "PENDING_CONFIRMATION", paidAt: null }),
      row({ status: "CANCELLED" }),
      row({ status: "REFUNDED" }),
      row({ status: "PENDING_PAYMENT", paidAt: null }),
    ]
    const { today } = salesSummary(rows, W)
    expect(today.placed).toBe(4)
    expect(today.paidSales).toBe(0)
    expect(today.saleOrders).toBe(0)
    expect(today.averageOrder).toBeNull()
  })

  test("the average divides by sale orders, not orders placed (E12)", () => {
    const rows = [
      ...Array.from({ length: 3 }, () => row({ total: 300_000 })),
      ...Array.from({ length: 4 }, () =>
        row({ status: "PENDING_PAYMENT", paidAt: null })
      ),
    ]
    const { today } = salesSummary(rows, W)
    expect(today.placed).toBe(7)
    expect(today.averageOrder).toBe(300_000)
  })

  test("no orders at all (E13)", () => {
    const s = salesSummary([], W)
    expect(s.today).toEqual({
      paidSales: 0,
      placed: 0,
      saleOrders: 0,
      averageOrder: null,
    })
    expect(s.last30).toEqual(s.today)
  })

  test("a paidAt in the future is ignored, never throws", () => {
    const r = row({ paidAt: iso("2027-01-01T00:00:00Z") })
    expect(() => salesSummary([r], W)).not.toThrow()
    expect(salesSummary([r], W).last30.saleOrders).toBe(0)
  })
})
