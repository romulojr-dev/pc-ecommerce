import { describe, expect, test } from "vitest"

import { ADMIN_HOME, safeNext } from "./safe-next"

// docs/specs/039-staff-sign-in-admin-shell, U1, U2, R-7

describe("safeNext", () => {
  test("an admin page is kept (U1)", () => {
    expect(safeNext("/admin/orders")).toBe("/admin/orders")
    expect(safeNext("/admin/orders?status=PAID")).toBe(
      "/admin/orders?status=PAID"
    )
  })

  test("an encoded admin path is kept after one decode", () => {
    expect(safeNext("%2Fadmin%2Forders")).toBe("/admin/orders")
  })

  test.each([
    "//evil.com",
    "https://evil.com",
    "http://localhost:3000/admin/orders",
    "javascript:alert(1)",
    "/admin/../checkout",
    "/admin/./orders/../../cart",
    "/cart",
    "/administrator",
    "admin/orders",
    "/\\evil.com",
    "/admin\\..\\cart",
    "%2F%2Fevil.com",
    "/admin/orders\r\nSet-Cookie: x=1",
    "/admin/\u0000",
    "%E0%A4%A",
  ])("%s becomes the default (U2)", (value) => {
    expect(safeNext(value)).toBe(ADMIN_HOME)
  })

  test("nothing, null and empty become the default (U2)", () => {
    expect(safeNext(undefined)).toBe(ADMIN_HOME)
    expect(safeNext(null)).toBe(ADMIN_HOME)
    expect(safeNext("")).toBe(ADMIN_HOME)
  })

  test("the login page and the bare /admin would loop or redirect, so they become the default", () => {
    expect(safeNext("/admin/login")).toBe(ADMIN_HOME)
    expect(safeNext("/admin/login?next=/admin/orders")).toBe(ADMIN_HOME)
    expect(safeNext("/admin")).toBe(ADMIN_HOME)
    expect(safeNext("/admin/")).toBe(ADMIN_HOME)
  })

  test("a double-encoded slash pair is decoded once only", () => {
    // %252F%252F decodes once to "%2F%2F", which isn't "//"
    expect(safeNext("%252F%252Fevil.com")).toBe(ADMIN_HOME)
  })
})
