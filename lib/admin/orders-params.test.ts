import { describe, expect, it } from "vitest"

import {
  backHrefOf,
  customerQueryOf,
  customerTooShort,
  DEFAULT_ORDER_PARAMS,
  hasActiveFilters,
  hasCustomerTerm,
  isCanonicalOrderQuery,
  mobileDigitsOf,
  ORDER_STATUSES,
  orderParamsHref,
  pageCount,
  parseOrderParams,
  resolvePage,
} from "./orders-params"

// docs/specs/041-admin-orders-list-detail: E2, E3, E3a, E5, E9a, E9b

describe("parseOrderParams", () => {
  it("E2: a page that is not a whole number from 1 up is page 1", () => {
    for (const page of ["abc", "0", "-3", "1.5", "", "99999999", " 2"]) {
      expect(parseOrderParams({ page }).page, page).toBe(1)
    }
    expect(parseOrderParams({ page: "2" }).page).toBe(2)
  })

  it("E5: unknown status and payment are ignored", () => {
    const params = parseOrderParams({ status: "bogus", payment: "card" })
    expect(params).toEqual(DEFAULT_ORDER_PARAMS)
  })

  it("accepts exactly the 11 statuses, upper-case", () => {
    expect(ORDER_STATUSES).toHaveLength(11)
    for (const status of ORDER_STATUSES) {
      expect(parseOrderParams({ status }).status).toBe(status)
      expect(parseOrderParams({ status: status.toLowerCase() }).status).toBe(
        null
      )
    }
  })

  it("accepts online and cod only", () => {
    expect(parseOrderParams({ payment: "online" }).payment).toBe("online")
    expect(parseOrderParams({ payment: "cod" }).payment).toBe("cod")
    expect(parseOrderParams({ payment: "COD" }).payment).toBe(null)
    expect(parseOrderParams({ payment: "gcash" }).payment).toBe(null)
  })

  it("a repeated key counts by its first value", () => {
    expect(parseOrderParams({ status: ["PAID", "SHIPPED"] }).status).toBe(
      "PAID"
    )
    expect(parseOrderParams({ page: ["3", "4"] }).page).toBe(3)
  })

  it("trims search text and cuts it at 100 characters", () => {
    const params = parseOrderParams({
      number: "  7k3m  ",
      customer: "x".repeat(150),
    })
    expect(params.number).toBe("7k3m")
    expect(params.customer).toHaveLength(100)
    expect(parseOrderParams({ number: "   " }).number).toBe("")
  })
})

describe("canonical URLs", () => {
  it("leaves defaults out", () => {
    expect(orderParamsHref(DEFAULT_ORDER_PARAMS)).toBe("/admin/orders")
    expect(
      orderParamsHref({ ...DEFAULT_ORDER_PARAMS, status: "SHIPPED", page: 2 })
    ).toBe("/admin/orders?status=SHIPPED&page=2")
  })

  it("escapes search text", () => {
    expect(
      orderParamsHref({ ...DEFAULT_ORDER_PARAMS, customer: "a&b=c d" })
    ).toBe("/admin/orders?customer=a%26b%3Dc+d")
  })

  it.each([
    [{}, true],
    [{ status: "SHIPPED" }, true],
    [{ status: "bogus" }, false],
    [{ page: "1" }, false],
    [{ page: "abc" }, false],
    [{ number: " 7k3m " }, false],
    [{ number: "7k3m" }, true],
    [{ status: ["PAID", "SHIPPED"] }, false],
    [{ status: undefined }, true],
  ])("isCanonicalOrderQuery(%j) is %s", (raw, expected) => {
    expect(isCanonicalOrderQuery(raw, parseOrderParams(raw))).toBe(expected)
  })

  it("a short customer term stays in the URL, so the hint can show", () => {
    const raw = { customer: "ab" }
    expect(isCanonicalOrderQuery(raw, parseOrderParams(raw))).toBe(true)
  })

  it("hasActiveFilters ignores the page", () => {
    expect(hasActiveFilters({ ...DEFAULT_ORDER_PARAMS, page: 3 })).toBe(false)
    expect(hasActiveFilters({ ...DEFAULT_ORDER_PARAMS, status: "PAID" })).toBe(
      true
    )
    expect(hasActiveFilters({ ...DEFAULT_ORDER_PARAMS, customer: "ab" })).toBe(
      true
    )
  })
})

describe("paging", () => {
  it("counts pages of 25, at least one", () => {
    expect(pageCount(0)).toBe(1)
    expect(pageCount(25)).toBe(1)
    expect(pageCount(26)).toBe(2)
    expect(pageCount(30)).toBe(2)
  })

  it("E3: a page past the last goes to the last", () => {
    expect(resolvePage(9, 30)).toBe(2)
    expect(resolvePage(2, 30)).toBe(2)
  })

  it("E3a: no match is page 1, whatever was asked", () => {
    expect(resolvePage(4, 0)).toBe(1)
  })
})

describe("customer search", () => {
  it("E9b: the phone spellings give the same digits", () => {
    for (const term of [
      "0917 123 4567",
      "+63 917 123 4567",
      "9171234567",
      "63 917 123 4567",
      "(0917) 123-4567",
    ]) {
      expect(mobileDigitsOf(term), term).toBe("9171234567")
    }
  })

  it("E9b: a partial number keeps its digits", () => {
    expect(mobileDigitsOf("917123")).toBe("917123")
    expect(mobileDigitsOf("0917123")).toBe("917123")
  })

  it("E9b: 0 and 63 add no mobile condition", () => {
    expect(mobileDigitsOf("0")).toBeNull()
    expect(mobileDigitsOf("63")).toBeNull()
    expect(mobileDigitsOf("639")).toBeNull()
    expect(mobileDigitsOf("0917")).toBe("917")
  })

  it("a name or an email is not read as a phone number", () => {
    expect(mobileDigitsOf("ana2025")).toBeNull()
    expect(mobileDigitsOf("ana.reyes@example.com")).toBeNull()
    expect(mobileDigitsOf("reyes")).toBeNull()
  })

  it("E9a: under 3 characters is ignored, and says so", () => {
    expect(customerQueryOf("ab")).toBeNull()
    expect(customerQueryOf("  ab  ")).toBeNull()
    expect(customerTooShort("ab")).toBe(true)
    expect(customerTooShort("")).toBe(false)
    expect(customerTooShort("abc")).toBe(false)
    expect(customerQueryOf("abc")).toEqual({ text: "abc", mobileDigits: null })
  })

  it("a 3-character term of any kind is searched", () => {
    expect(customerQueryOf("REY")).toEqual({ text: "REY", mobileDigits: null })
    expect(customerQueryOf("917")).toEqual({
      text: "917",
      mobileDigits: "917",
    })
  })

  it("Demo is refused for any typed term, whatever its length", () => {
    expect(hasCustomerTerm("a")).toBe(true)
    expect(hasCustomerTerm("   ")).toBe(false)
    expect(hasCustomerTerm("")).toBe(false)
  })
})

describe("buyer (docs/specs/042-admin-customers)", () => {
  it("is parsed, trimmed, cut at 100 characters and written after customer", () => {
    expect(parseOrderParams({ buyer: " c3 " }).buyer).toBe("c3")
    expect(parseOrderParams({ buyer: "x".repeat(150) }).buyer).toHaveLength(100)
    expect(
      orderParamsHref({
        ...DEFAULT_ORDER_PARAMS,
        customer: "ana",
        buyer: "a@b.co",
        page: 2,
      })
    ).toBe("/admin/orders?customer=ana&buyer=a%40b.co&page=2")
  })

  it("counts as an active filter and survives the back value", () => {
    expect(hasActiveFilters({ ...DEFAULT_ORDER_PARAMS, buyer: "c1" })).toBe(
      true
    )
    expect(backHrefOf("buyer=c1&status=PAID")).toBe(
      "/admin/orders?status=PAID&buyer=c1"
    )
  })

  it("makes a spelled-out buyer non-canonical", () => {
    const raw = { buyer: "c1" }
    expect(isCanonicalOrderQuery(raw, parseOrderParams(raw))).toBe(true)
    const bad = { buyer: " c1 " }
    expect(isCanonicalOrderQuery(bad, parseOrderParams(bad))).toBe(false)
  })
})
