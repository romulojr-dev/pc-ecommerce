import { readFileSync } from "node:fs"

import { NextRequest } from "next/server"
import { describe, expect, test } from "vitest"

import { config, proxy } from "./proxy"

// docs/specs/039-staff-sign-in-admin-shell, R1–R5

const request = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : {},
  })

const passesThrough = (response: Response) =>
  response.headers.get("x-middleware-next") === "1"

describe("proxy", () => {
  test("no cookie: /admin/orders goes to the form with next (R1)", () => {
    const response = proxy(request("/admin/orders"))
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/admin/login?next=%2Fadmin%2Forders"
    )
  })

  test("the query string is kept in next", () => {
    const response = proxy(request("/admin/orders?status=PAID"))
    expect(
      new URL(response.headers.get("location")!).searchParams.get("next")
    ).toBe("/admin/orders?status=PAID")
  })

  test("the bare /admin goes to the form too", () => {
    expect(proxy(request("/admin")).headers.get("location")).toContain(
      "/admin/login?next=%2Fadmin"
    )
  })

  test("a cookie of the right name passes, whatever its value (R2)", () => {
    for (const cookie of [
      "better-auth.session_token=anything",
      "__Secure-better-auth.session_token=anything",
    ]) {
      expect(passesThrough(proxy(request("/admin/orders", cookie)))).toBe(true)
    }
  })

  test("another cookie does not count", () => {
    const response = proxy(request("/admin/orders", "theme=dark; cart=abc"))
    expect(response.status).toBe(307)
  })

  test("/admin/login passes with no cookie, so the form renders (R3)", () => {
    expect(passesThrough(proxy(request("/admin/login")))).toBe(true)
    expect(passesThrough(proxy(request("/admin/login?next=%2Fadmin")))).toBe(
      true
    )
  })
})

describe("the matcher (R4)", () => {
  const matcher = new RegExp(
    `^${config.matcher[0]!.replace("/:path*", "(?:/.*)?")}$`
  )

  test("covers /admin and below", () => {
    for (const path of ["/admin", "/admin/orders", "/admin/orders/PCS-1"]) {
      expect(matcher.test(path), path).toBe(true)
    }
  })

  test("leaves everything else alone, /api/auth included", () => {
    for (const path of [
      "/cart",
      "/administrator",
      "/api/auth/get-session",
      "/api/auth/sign-in/email",
      "/_next/static/x.js",
    ]) {
      expect(matcher.test(path), path).toBe(false)
    }
  })
})

describe("proxy.ts source (R5)", () => {
  const source = readFileSync(new URL("./proxy.ts", import.meta.url), "utf8")

  test("exports no runtime: Proxy throws if one is set", () => {
    expect(source).not.toMatch(/export\s+(const|let|var)\s+runtime\b/)
    expect(source).not.toMatch(/runtime\s*:/)
  })

  test("validates nothing: it does not import the auth instance or the database", () => {
    expect(source).not.toMatch(/lib\/auth\/auth"/)
    expect(source).not.toMatch(/lib\/db"/)
  })
})
