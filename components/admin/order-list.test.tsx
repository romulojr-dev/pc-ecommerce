import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  DEFAULT_ORDER_PARAMS,
  type OrderParams,
} from "@/lib/admin/orders-params"
import type { OrderList, OrderListRow } from "@/lib/admin/queries/orders"

import { OrderFilters } from "./order-filters"
import { OrderListView } from "./order-list"

// docs/specs/041-admin-orders-list-detail: B1–B9, E1, E3a, E12, E15, E16

const row = (over: Partial<OrderListRow> = {}): OrderListRow => ({
  orderNumber: "PCS-7K3M9Q2X",
  createdAt: new Date("2026-11-02T06:00:00Z"),
  status: "PENDING_PAYMENT",
  dueForRelease: false,
  fulfillment: "DELIVERY",
  paymentOption: "ONLINE",
  paymentMethod: null,
  total: 2_311_000,
  customer: { masked: false, name: "Ana Reyes" },
  flags: { refundRequired: false, needsCheck: false },
  ...over,
})

const data = (
  rows: OrderListRow[],
  over: Partial<OrderList> = {}
): OrderList => ({
  ok: true,
  rows,
  total: rows.length,
  page: 1,
  pageCount: 1,
  ...over,
})

const params = (over: Partial<OrderParams> = {}): OrderParams => ({
  ...DEFAULT_ORDER_PARAMS,
  ...over,
})

const html = (d: OrderList, p = params()) =>
  renderToStaticMarkup(<OrderListView data={d} params={p} />)

describe("the order list", () => {
  it("shows a row with its number as a link, status, payment and total", () => {
    const markup = html(data([row()]))
    expect(markup).toContain('href="/admin/orders/PCS-7K3M9Q2X"')
    expect(markup).toContain("Pending payment")
    expect(markup).toContain("Online")
    expect(markup).toContain("Delivery")
    expect(markup).toContain("₱23,110.00")
    expect(markup).toContain("1 order")
    expect(markup).toContain("Page 1 of 1")
    expect(markup).toContain("<caption")
  })

  it("E12: a past-deadline order keeps its status and gains the badge", () => {
    const markup = html(data([row({ dueForRelease: true })]))
    expect(markup).toContain("Pending payment")
    expect(markup).toContain("Due for release")
    expect(markup).not.toContain("Cancelled")
  })

  it("E15, E16: the flags show", () => {
    const markup = html(
      data([
        row({
          status: "CANCELLED",
          flags: { refundRequired: true, needsCheck: true },
        }),
      ])
    )
    expect(markup).toContain("Refund required")
    expect(markup).toContain("Needs checking")
    expect(html(data([row()]))).not.toContain("Needs checking")
  })

  it("names the cash options in the payment column", () => {
    const markup = html(
      data([
        row({ paymentOption: "COD" }),
        row({
          orderNumber: "PCS-PICKUP01",
          paymentOption: "COD",
          fulfillment: "PICKUP",
        }),
        row({
          orderNumber: "PCS-GCASH001",
          paymentMethod: "GCASH",
          status: "PAID",
        }),
      ])
    )
    expect(markup).toContain("Cash on delivery")
    expect(markup).toContain("Pay on pickup")
    expect(markup).toContain("Online (GCash)")
  })

  it("shows a masked name as it is", () => {
    const markup = html(
      data([row({ customer: { masked: true, name: "A••• R•••" as never } })])
    )
    expect(markup).toContain("A••• R•••")
    expect(markup).not.toContain("Ana Reyes")
  })

  it("empty with no filters says there are no orders yet", () => {
    const markup = html(data([]))
    expect(markup).toContain("No orders yet.")
    expect(markup).not.toContain("Clear filters")
  })

  it("E3a: empty with filters says none match, and offers Clear filters", () => {
    const markup = html(data([]), params({ status: "SHIPPED", page: 4 }))
    expect(markup).toContain("No orders match these filters.")
    expect(markup).toContain("Clear filters")
    expect(markup).toContain('href="/admin/orders"')
    expect(markup).not.toContain("<table")
  })

  it("E1: pagination links keep the filters", () => {
    const p = params({ status: "PAID" })
    const middle = html(data([row()], { total: 60, page: 2, pageCount: 3 }), {
      ...p,
      page: 2,
    })
    expect(middle).toContain("Page 2 of 3")
    expect(middle).toContain('href="/admin/orders?status=PAID"')
    expect(middle).toContain('href="/admin/orders?status=PAID&amp;page=3"')

    const first = html(data([row()], { total: 60, page: 1, pageCount: 3 }), p)
    expect(first).not.toContain("Previous")
    expect(first).toContain("Next")
    expect(html(data([row()]))).not.toContain("Order pages")
  })
})

describe("the filter form", () => {
  const form = (p = params(), canSearchCustomer = true) =>
    renderToStaticMarkup(
      <OrderFilters
        params={p}
        canSearchCustomer={canSearchCustomer}
        resultsId="orders-results"
      />
    )

  it("is a GET form with labelled fields that works without JavaScript", () => {
    const markup = form()
    expect(markup).toContain('method="get"')
    expect(markup).toContain('action="/admin/orders#orders-results"')
    for (const label of ["Status", "Payment", "Order number", "Customer"]) {
      expect(markup).toContain(`>${label}</label>`)
    }
    expect(markup).toContain("All statuses")
    expect(markup).toContain("Cash on delivery or pickup")
    expect(markup).not.toContain("Clear filters")
  })

  it("keeps the current values and offers Clear filters", () => {
    const markup = form(
      params({ status: "SHIPPED", payment: "cod", number: "7k3m" })
    )
    expect(markup).toMatch(/<option value="SHIPPED" selected/)
    expect(markup).toMatch(/<option value="cod" selected/)
    expect(markup).toContain('value="7k3m"')
    expect(markup).toContain("Clear filters")
  })

  it("lists the 11 statuses", () => {
    expect(form().match(/<option value="[A-Z_]+"/g)).toHaveLength(11)
  })

  it("B7: a too-short customer term says so", () => {
    const markup = form(params({ customer: "ab" }))
    expect(markup).toContain("Type at least 3 characters to search customers.")
    expect(form(params({ customer: "abc" }))).not.toContain(
      "Type at least 3 characters"
    )
  })

  it("B7: Demo's customer box is disabled, named read-only and not submitted", () => {
    const markup = form(params(), false)
    expect(markup).toContain("disabled")
    expect(markup).toContain('placeholder="This account is read-only"')
    expect(markup).not.toContain('name="customer"')
  })
})
