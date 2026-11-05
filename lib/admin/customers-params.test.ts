import { describe, expect, it } from "vitest"

import {
  customerPageCount,
  customersHref,
  DEFAULT_CUSTOMER_PARAMS,
  isCanonicalCustomerQuery,
  parseCustomerParams,
  resolveCustomerPage,
} from "./customers-params"

// docs/specs/042-admin-customers, E18, E27

describe("parseCustomerParams", () => {
  it("defaults an empty query", () => {
    expect(parseCustomerParams({})).toEqual(DEFAULT_CUSTOMER_PARAMS)
  })

  it.each(["abc", "0", "-3", "1.5", "99999999"])(
    "page %s is page 1",
    (page) => {
      expect(parseCustomerParams({ page }).page).toBe(1)
    }
  )

  it("keeps a valid page and trims and cuts the term", () => {
    const params = parseCustomerParams({
      page: "4",
      customer: `  ${"x".repeat(150)}  `,
    })
    expect(params.page).toBe(4)
    expect(params.customer).toHaveLength(100)
  })

  it("uses the first of a repeated value", () => {
    expect(
      parseCustomerParams({ customer: ["ana", "ben"], page: ["2", "3"] })
    ).toEqual({ customer: "ana", page: 2 })
  })
})

describe("the canonical URL", () => {
  it("leaves defaults out", () => {
    expect(customersHref(DEFAULT_CUSTOMER_PARAMS)).toBe("/admin/customers")
    expect(customersHref({ customer: "a&b", page: 2 })).toBe(
      "/admin/customers?customer=a%26b&page=2"
    )
  })

  it("flags a spelled-out default or a repeated key", () => {
    const ok = (raw: Record<string, string | string[]>) =>
      isCanonicalCustomerQuery(raw, parseCustomerParams(raw))
    expect(ok({})).toBe(true)
    expect(ok({ page: "2" })).toBe(true)
    expect(ok({ page: "1" })).toBe(false)
    expect(ok({ page: "abc" })).toBe(false)
    expect(ok({ customer: ["a", "b"] })).toBe(false)
  })
})

describe("paging", () => {
  it("counts pages of 25, at least one", () => {
    expect(customerPageCount(0)).toBe(1)
    expect(customerPageCount(25)).toBe(1)
    expect(customerPageCount(26)).toBe(2)
    expect(customerPageCount(30)).toBe(2)
  })

  it("lands on the last page, and on page 1 with no results", () => {
    expect(resolveCustomerPage(9, 30)).toBe(2)
    expect(resolveCustomerPage(4, 0)).toBe(1)
    expect(resolveCustomerPage(2, 30)).toBe(2)
  })
})
