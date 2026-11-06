import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { SalesFigures } from "@/lib/admin/dashboard-sales"
import type { OrderListRow } from "@/lib/admin/queries/orders"

import { DashboardFigures } from "./dashboard-figures"
import { DashboardRecent } from "./dashboard-recent"
import { DashboardRestock } from "./dashboard-restock"
import { DashboardReview } from "./dashboard-review"

// docs/specs/048-admin-dashboard: B5 to B8, B10, E13, E14, E15, E19, E26 as
// markup

const zero: SalesFigures = {
  paidSales: 0,
  placed: 0,
  saleOrders: 0,
  averageOrder: null,
}

describe("figures", () => {
  it("shows the labels, notes and a dash with no sale orders (E13, E14)", () => {
    const html = renderToStaticMarkup(
      <DashboardFigures id="x" heading="Today" figures={zero} />
    )
    expect(html).toContain("Paid sales")
    expect(html).toContain("₱0.00")
    expect(html).toContain("Orders placed")
    expect(html).toContain("Average order value")
    expect(html).toContain("—")
    expect(html).toContain("Excludes cancelled and refunded orders.")
    expect(html).toContain("Cash orders count when delivered or picked up.")
    expect(html).not.toMatch(/NaN|undefined/)
  })

  it("shows the figures as pesos", () => {
    const html = renderToStaticMarkup(
      <DashboardFigures
        id="x"
        heading="Today"
        figures={{
          paidSales: 6_000_000,
          placed: 3,
          saleOrders: 3,
          averageOrder: 2_000_000,
        }}
      />
    )
    expect(html).toContain("₱60,000.00")
    expect(html).toContain("₱20,000.00")
  })
})

describe("restocking", () => {
  const item = (n: number, stock: number) => ({
    id: `p${n}`,
    name: `Part ${n}`,
    sku: `SKU-${n}`,
    stock,
  })

  it("is empty with nothing to restock", () => {
    const html = renderToStaticMarkup(
      <DashboardRestock restock={{ total: 0, items: [] }} />
    )
    expect(html).toContain("Needs restocking (0)")
    expect(html).toContain("Nothing needs restocking.")
    expect(html).not.toContain("View all")
  })

  it("labels out and low in text and links the rest (E15)", () => {
    const html = renderToStaticMarkup(
      <DashboardRestock
        restock={{ total: 12, items: [item(1, 0), item(2, 3)] }}
      />
    )
    expect(html).toContain("Needs restocking (12)")
    expect(html).toContain("Out of stock")
    expect(html).toContain("Low stock")
    expect(html).toContain("/admin/inventory/p1")
    expect(html).toContain("View all 12")
    expect(html).toContain("/admin/inventory?level=restock")
  })
})

describe("recent orders", () => {
  const row = (over: Partial<OrderListRow> = {}): OrderListRow => ({
    orderNumber: "PCS-AAAAAAAA",
    createdAt: new Date("2026-11-06T03:00:00Z"),
    status: "PENDING_PAYMENT",
    dueForRelease: true,
    fulfillment: "DELIVERY",
    paymentOption: "ONLINE",
    paymentMethod: null,
    total: 2_311_000,
    customer: { masked: true, name: "A••• R•••" as never },
    flags: { refundRequired: false, needsCheck: false },
    ...over,
  })

  it("is empty with no orders", () => {
    const html = renderToStaticMarkup(<DashboardRecent rows={[]} />)
    expect(html).toContain("No orders yet.")
    expect(html).toContain("View all orders")
  })

  it("shows the number as a link, the masked name, the Due badge and the total (E19, E26)", () => {
    const html = renderToStaticMarkup(<DashboardRecent rows={[row()]} />)
    expect(html).toContain("/admin/orders/PCS-AAAAAAAA")
    expect(html).toContain("A••• R•••")
    expect(html).toContain("Due for release")
    expect(html).toContain("₱23,110.00")
  })
})

describe("needs review", () => {
  it("says what it counts, with no link yet (D12)", () => {
    expect(renderToStaticMarkup(<DashboardReview count={1} />)).toContain(
      "1 order needs payment review."
    )
    const many = renderToStaticMarkup(<DashboardReview count={3} />)
    expect(many).toContain("3 orders need payment review.")
    expect(many).not.toContain("<a")
  })

  it("is empty at zero", () => {
    expect(renderToStaticMarkup(<DashboardReview count={0} />)).toContain(
      "Nothing needs review."
    )
  })
})
