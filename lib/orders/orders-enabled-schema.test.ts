import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { ordersEnabledSchema } from "./orders-enabled-schema"

// docs/specs/030-place-an-order: Z3, Z4, Z7

describe("ORDERS_ENABLED schema", () => {
  it("is off when unset (fails closed)", () => {
    expect(ordersEnabledSchema.parse(undefined)).toBe(false)
  })

  it("accepts true and false", () => {
    expect(ordersEnabledSchema.parse("true")).toBe(true)
    expect(ordersEnabledSchema.parse("false")).toBe(false)
  })

  it.each(["TRUE", "True", "1", "0", "yes", "on", " true", "true "])(
    "refuses %j",
    (value) => {
      expect(ordersEnabledSchema.safeParse(value).success).toBe(false)
    }
  )
})

describe("where the switch is documented (Z7)", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

  it("is in .env.example, on locally", () => {
    expect(read(".env.example")).toMatch(/^ORDERS_ENABLED="?true"?$/m)
  })

  it("is in the payments setup page with the turn-on step after #81", () => {
    const page = read("docs/setup/payments.md")
    expect(page).toContain("`ORDERS_ENABLED`")
    expect(page).toMatch(/After #81 is merged and deployed/)
  })

  it("is set to true for CI's build and E2E", () => {
    expect(read(".github/workflows/ci.yml")).toMatch(
      /^\s+ORDERS_ENABLED: "?true"?$/m
    )
  })
})
