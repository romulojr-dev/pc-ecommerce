import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  type CustomerParams,
  DEFAULT_CUSTOMER_PARAMS,
} from "@/lib/admin/customers-params"
import type { CustomerList, CustomerRow } from "@/lib/admin/queries/customers"

import { CustomerListView } from "./customer-list"
import { CustomerSearch } from "./customer-search"

// docs/specs/042-admin-customers: B1–B10, E1, E19, E20, E25, E29

const row = (over: Partial<CustomerRow> = {}): CustomerRow => ({
  id: "ana.reyes@example.com",
  contact: { masked: false, name: "Ana Reyes", email: "ana.reyes@example.com" },
  orderCount: 3,
  totalSpent: 5_049_000,
  lastOrderAt: new Date("2026-11-02T06:00:00Z"),
  ...over,
})

const data = (
  rows: CustomerRow[],
  over: Partial<CustomerList> = {}
): CustomerList => ({
  ok: true,
  rows,
  total: rows.length,
  page: 1,
  pageCount: 1,
  ...over,
})

const params = (over: Partial<CustomerParams> = {}): CustomerParams => ({
  ...DEFAULT_CUSTOMER_PARAMS,
  ...over,
})

const html = (d: CustomerList, p = params()) =>
  renderToStaticMarkup(<CustomerListView data={d} params={p} />)

describe("the customer list", () => {
  it("shows name, email, orders placed, total spent, last order and a link", () => {
    const out = html(data([row()]))
    expect(out).toContain("Ana Reyes")
    expect(out).toContain("ana.reyes@example.com")
    expect(out).toContain("Orders placed")
    expect(out).toContain(">3<")
    expect(out).toContain("₱50,490.00")
    expect(out).toContain("Mon 2 Nov 2026, 2:00 PM")
    expect(out).toContain('href="/admin/orders?buyer=ana.reyes%40example.com"')
    expect(out).toContain("1 customer")
    expect(out).toContain("<caption")
    expect(out).toContain('scope="col"')
  })

  it("a customer with nothing counted shows ₱0.00", () => {
    expect(html(data([row({ totalSpent: 0 })]))).toContain("₱0.00")
  })

  it("E20: a Demo row is masked and links by its rank key", () => {
    const out = html(
      data([
        row({
          id: "c1",
          contact: {
            masked: true,
            name: "A••• R•••" as never,
            email: "a•••@••••.•••" as never,
          },
        }),
      ])
    )
    expect(out).toContain("A••• R•••")
    expect(out).toContain('href="/admin/orders?buyer=c1"')
    expect(out).not.toContain("Reyes")
    expect(out).not.toContain("example.com")
  })

  it("E25: no customers at all", () => {
    const out = html(data([]))
    expect(out).toContain(
      "No customers yet. They appear after the first order."
    )
    expect(out).not.toContain("Clear search")
  })

  it("E19: a search with no match says so and offers Clear search", () => {
    const out = html(data([]), params({ customer: "zzzzzz" }))
    expect(out).toContain("No customers match this search.")
    expect(out).toContain("Clear search")
    expect(out).toContain('href="/admin/customers"')
  })

  it("pages link to the neighbours and keep the search", () => {
    const out = html(
      data([row()], { total: 60, page: 2, pageCount: 3 }),
      params({ customer: "ana", page: 2 })
    )
    expect(out).toContain("Page 2 of 3")
    expect(out).toContain("customer=ana")
    expect(out).toContain('href="/admin/customers?customer=ana"')
    expect(out).toContain('href="/admin/customers?customer=ana&amp;page=3"')
  })
})

describe("the search form", () => {
  const form = (canSearch: boolean, p = params()) =>
    renderToStaticMarkup(<CustomerSearch params={p} canSearch={canSearch} />)

  it("is a labelled GET form for Owner and Staff", () => {
    const out = form(true, params({ customer: "reyes" }))
    expect(out).toContain('method="get"')
    expect(out).toContain("Name, email or mobile")
    expect(out).toContain('name="customer"')
    expect(out).toContain('value="reyes"')
    expect(out).toContain("Clear search")
  })

  it("E18: a short term gets the hint", () => {
    expect(form(true, params({ customer: "ab" }))).toContain(
      "Type at least 3 characters to search customers."
    )
  })

  it("E21: Demo's field is disabled, has no name and no submit", () => {
    const out = form(false, params({ customer: "reyes" }))
    expect(out).toContain("disabled")
    expect(out).toContain("This account is read-only")
    expect(out).not.toContain('name="customer"')
    expect(out).not.toContain('type="submit"')
    expect(out).not.toContain("reyes")
  })
})
