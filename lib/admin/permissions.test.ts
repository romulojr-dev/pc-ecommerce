import { describe, expect, test } from "vitest"

import {
  ADMIN_ACTIONS,
  ADMIN_ROLES,
  adminRoleOf,
  type AdminAction,
  can,
  isOwnerOnly,
  isReadAction,
} from "./permissions"

// The issue's table (#105), written out again on purpose: [owner, staff, demo]
const EXPECTED: Record<AdminAction, [boolean, boolean, boolean]> = {
  "dashboard.view": [true, false, true],
  "orders.view": [true, true, true],
  "orders.search-customer": [true, true, false],
  "orders.packing-slip": [true, true, true],
  "orders.transition": [true, true, false],
  "orders.cancel": [true, true, false],
  "customers.view": [true, true, true],
  "refunds.record": [true, false, false],
  "payments.review": [true, false, false],
  "products.view": [true, false, true],
  "products.write": [true, false, false],
  "images.write": [true, false, false],
  "categories.view": [true, false, true],
  "brands.view": [true, false, true],
  "categories.write": [true, false, false],
  "brands.write": [true, false, false],
  "inventory.view": [true, true, true],
  "inventory.adjust": [true, true, false],
  "settings.view": [true, false, true],
  "vouchers.view": [true, false, true],
  "settings.write": [true, false, false],
  "rates.write": [true, false, false],
  "vouchers.write": [true, false, false],
  "audit.view": [true, false, true],
}

describe("can()", () => {
  test("the table lists exactly the actions of the type", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...ADMIN_ACTIONS].sort())
    expect(ADMIN_ACTIONS).toHaveLength(24)
  })

  test.each(ADMIN_ACTIONS)("%s for every role", (action) => {
    const [owner, staff, demo] = EXPECTED[action]
    expect(can("owner", action)).toBe(owner)
    expect(can("staff", action)).toBe(staff)
    expect(can("demo", action)).toBe(demo)
  })

  test("examples E1 to E3", () => {
    expect(can("demo", "orders.cancel")).toBe(false)
    expect(can("staff", "dashboard.view")).toBe(false)
    expect(can("demo", "orders.search-customer")).toBe(false)
    expect(can("demo", "orders.view")).toBe(true)
  })

  test("an unknown role or action is false", () => {
    expect(can("admin", "orders.view")).toBe(false)
    expect(can("", "orders.view")).toBe(false)
    expect(can("owner", "orders.refund")).toBe(false)
    expect(can("owner", "toString")).toBe(false)
    expect(can("constructor", "orders.view")).toBe(false)
  })

  test("Demo holds only read actions", () => {
    for (const action of ADMIN_ACTIONS) {
      if (can("demo", action)) expect(isReadAction(action)).toBe(true)
    }
  })

  test("Owner can do everything", () => {
    for (const action of ADMIN_ACTIONS) expect(can("owner", action)).toBe(true)
    expect(ADMIN_ROLES).toEqual(["owner", "staff", "demo"])
  })

  test("owner-only actions are the ones Staff lacks", () => {
    expect(isOwnerOnly("refunds.record")).toBe(true)
    expect(isOwnerOnly("orders.cancel")).toBe(false)
  })
})

describe("adminRoleOf()", () => {
  test("maps the database roles", () => {
    expect(adminRoleOf("OWNER")).toBe("owner")
    expect(adminRoleOf("STAFF")).toBe("staff")
    expect(adminRoleOf("DEMO")).toBe("demo")
  })

  test("anything else is no role", () => {
    expect(adminRoleOf("owner")).toBeNull()
    expect(adminRoleOf("ADMIN")).toBeNull()
    expect(adminRoleOf("")).toBeNull()
  })
})
