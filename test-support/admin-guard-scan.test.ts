import { join } from "node:path"

import { describe, expect, test, vi } from "vitest"

import {
  fileHasUseServerDirective,
  hasUseServerDirective,
  scanModules,
} from "./admin-guard-scan"

// Importing a real module loads its data code, and lib/env.ts validates the
// environment at import. These mocks keep the import from needing a database
// or env vars; nothing here calls them.
vi.mock("@/lib/env", () => ({ env: {} }))
vi.mock("@/lib/db", () => ({ db: {} }))

const root = process.cwd()
const fixture = (name: string) =>
  join(root, "test-support", "admin-fixtures", name)

describe("the enumeration scan", () => {
  test("reports an unguarded action module's exports", async () => {
    const { unguarded } = await scanModules([
      { path: fixture("unguarded-actions.ts"), kind: "actions" },
    ])
    expect(unguarded.map((u) => u.export)).toEqual(["deleteEverythingAction"])
  })

  test("reports an unguarded route's POST", async () => {
    const { unguarded } = await scanModules([
      { path: fixture("unguarded-route.ts"), kind: "route" },
    ])
    expect(unguarded.map((u) => u.export)).toEqual(["POST"])
  })

  test("passes a marked function and names its action", async () => {
    const { unguarded, guarded } = await scanModules([
      { path: fixture("guarded-actions.ts"), kind: "actions" },
    ])
    expect(unguarded).toEqual([])
    expect(guarded).toMatchObject([
      { export: "guardedAction", action: "orders.view" },
    ])
  })

  test("imports a real use-server module without env, db or headers failing", async () => {
    const { unguarded } = await scanModules([
      {
        path: join(root, "app", "(store)", "cart", "actions.ts"),
        kind: "actions",
      },
    ])
    // The cart's actions are not admin actions, so none carries the marker
    expect(unguarded.length).toBeGreaterThan(0)
    expect(unguarded.map((u) => u.export)).toContain("addToCartAction")
  })
})

describe("use server detection", () => {
  test("reads the directive, not the words", () => {
    expect(hasUseServerDirective('"use server"\nexport const a = 1')).toBe(true)
    expect(hasUseServerDirective("// header\n/* more */\n'use server'\n")).toBe(
      true
    )
    expect(
      hasUseServerDirective("// no use server here\nexport const a = 1")
    ).toBe(false)
    expect(hasUseServerDirective('import x from "y"\n"use server"')).toBe(false)
  })

  test("lib/auth/auth.ts only mentions the words in a comment", () => {
    expect(
      fileHasUseServerDirective(join(root, "lib", "auth", "auth.ts"))
    ).toBe(false)
  })
})
