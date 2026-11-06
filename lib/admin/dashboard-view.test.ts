import { expect, test } from "vitest"

import { DASHBOARD_COPY } from "./dashboard-copy"
import { adminHomeFor, figureTexts } from "./dashboard-view"

// docs/specs/048-admin-dashboard: B2, B10, E13, E23
test("zero figures read as ₱0.00, 0 and a dash", () => {
  expect(
    figureTexts({ paidSales: 0, placed: 0, saleOrders: 0, averageOrder: null })
  ).toEqual({ paidSales: "₱0.00", placed: "0", average: "—" })
})

test("figures are pesos", () => {
  expect(
    figureTexts({
      paidSales: 10_000,
      placed: 3,
      saleOrders: 3,
      averageOrder: 3333,
    })
  ).toEqual({ paidSales: "₱100.00", placed: "3", average: "₱33.33" })
})

test("owner and demo land on the dashboard, staff on orders", () => {
  expect(adminHomeFor("owner")).toBe("/admin/dashboard")
  expect(adminHomeFor("demo")).toBe("/admin/dashboard")
  expect(adminHomeFor("staff")).toBe("/admin/orders")
})

test("the needs-review sentence is singular or plural", () => {
  expect(DASHBOARD_COPY.review.text(1)).toBe("1 order needs payment review.")
  expect(DASHBOARD_COPY.review.text(2)).toBe("2 orders need payment review.")
})
