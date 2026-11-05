import { readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"

import { describe, expect, test, vi } from "vitest"

import {
  checkGuarded,
  exportsWriteMethod,
  fileHasUseServerDirective,
  hasAnyUseServerDirective,
  type ModuleKind,
  scanModules,
  sourceFiles,
} from "@/test-support/admin-guard-scan"

// docs/specs/040-admin-permissions-audit-masking, R8 and R9, T5. The scan
// hunts for UNGUARDED entry points: every exported function of every admin
// "use server" module, and every exported route handler under app/api/admin,
// must carry the adminAction marker. Real modules import data code, and
// lib/env.ts validates the environment at import, so those two are mocked.
vi.mock("@/lib/env", () => ({ env: {} }))
vi.mock("@/lib/db", () => ({ db: {} }))

const root = process.cwd()
const rel = (path: string) => relative(root, path).split(sep).join("/")
const fixture = (name: string) =>
  join(root, "test-support", "admin-fixtures", name)

// ---- What the folders hold ----

const adminActionFiles = sourceFiles(join(root, "app", "admin")).filter(
  (path) => fileHasUseServerDirective(path)
)
const adminRouteFiles = sourceFiles(join(root, "app", "api", "admin")).filter(
  (path) => rel(path).endsWith("/route.ts")
)

function realModules(): { path: string; kind: ModuleKind }[] {
  return [
    ...adminActionFiles.map((path) => ({ path, kind: "actions" as const })),
    ...adminRouteFiles.map((path) => ({ path, kind: "route" as const })),
  ]
}

describe("the real admin entry points", () => {
  test("none is unguarded", async () => {
    const { unguarded } = await scanModules(realModules())
    expect(unguarded).toEqual([])
  })

  test("every marker names an action in the table", async () => {
    const { guarded } = await scanModules(realModules())
    expect(checkGuarded(guarded)).toEqual([])
  })

  test("discovery sees every actions.ts and route.ts in the admin folders", () => {
    const actionsFiles = sourceFiles(join(root, "app", "admin")).filter((p) =>
      rel(p).endsWith("/actions.ts")
    )
    // An actions.ts without the directive would not be scanned: refuse it
    expect(actionsFiles.map(rel).sort()).toEqual(
      adminActionFiles.map(rel).sort()
    )
  })
})

describe("the scan catches what is wrong (E17, E18)", () => {
  test("an unguarded action module and an unguarded POST", async () => {
    const { unguarded } = await scanModules([
      { path: fixture("unguarded-actions.ts"), kind: "actions" },
      { path: fixture("unguarded-route.ts"), kind: "route" },
    ])
    expect(unguarded.map((u) => `${rel(u.file)}#${u.export}`).sort()).toEqual([
      "test-support/admin-fixtures/unguarded-actions.ts#deleteEverythingAction",
      "test-support/admin-fixtures/unguarded-route.ts#POST",
    ])
  })

  test("a marker that names an action the table lacks", async () => {
    const { guarded } = await scanModules([
      { path: fixture("unknown-action.ts"), kind: "actions" },
    ])
    expect(checkGuarded(guarded)).toEqual([
      expect.stringContaining('unknown action "orders.refund"'),
    ])
  })

  test("a correctly marked module passes both checks", async () => {
    const { unguarded, guarded } = await scanModules([
      { path: fixture("guarded-actions.ts"), kind: "actions" },
    ])
    expect(unguarded).toEqual([])
    expect(checkGuarded(guarded)).toEqual([])
  })
})

// ---- Placement (R9): admin mutations live only in the admin folders ----

// Every "use server" file and every route with a write method outside the
// admin folders, named with its reason. A new one fails until it is added
// here on purpose.
const ALLOWED_OUTSIDE_ADMIN = new Map<string, string>([
  ["app/(store)/builder/actions.ts", "store: builder share and cart"],
  ["app/(store)/cart/actions.ts", "store: cart"],
  ["app/(store)/checkout/actions.ts", "store: checkout and payment"],
  ["app/(store)/orders/[number]/actions.ts", "store: order page"],
  ["app/(store)/test-payment/[id]/actions.ts", "store: fake payment page"],
  ["app/api/auth/[...all]/route.ts", "Better Auth sign-in and sign-out"],
  ["app/api/webhooks/xendit/route.ts", "payment webhook"],
])

const SCANNED_ROOTS = ["app", "components", "lib", "hooks", "scripts"]
const allSource = SCANNED_ROOTS.flatMap((dir) => sourceFiles(join(root, dir)))
const isAdminPath = (path: string) =>
  rel(path).startsWith("app/admin/") ||
  rel(path).startsWith("app/api/admin/") ||
  rel(path).startsWith("components/admin/") ||
  rel(path).startsWith("lib/admin/")

describe("placement", () => {
  test('"use server" files and write routes outside the admin folders are on the allowlist', () => {
    const found = allSource
      .filter((path) => !isAdminPath(path))
      .filter((path) => {
        const source = readFileSync(path, "utf8")
        const isRoute = rel(path).endsWith("/route.ts")
        return (
          fileHasUseServerDirective(path) ||
          (isRoute && exportsWriteMethod(source))
        )
      })
      .map(rel)
      .sort()
    expect(found).toEqual([...ALLOWED_OUTSIDE_ADMIN.keys()].sort())
  })

  test("the allowlist has no stale entries", () => {
    for (const path of ALLOWED_OUTSIDE_ADMIN.keys()) {
      expect(allSource.map(rel), path).toContain(path)
    }
  })

  test("a use-server directive in the admin folders is only in an actions.ts", () => {
    const bad = allSource
      .filter(isAdminPath)
      .filter((path) => !rel(path).endsWith("/actions.ts"))
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .filter((path) => hasAnyUseServerDirective(readFileSync(path, "utf8")))
      .map(rel)
    expect(bad).toEqual([])
  })

  test("the helpers recognise write routes and inline directives (E23)", () => {
    expect(exportsWriteMethod("export async function POST() {}")).toBe(true)
    expect(exportsWriteMethod("export const DELETE = handler")).toBe(true)
    expect(exportsWriteMethod("export { handler as PATCH, GET }")).toBe(true)
    expect(exportsWriteMethod("export { PUT }")).toBe(true)
    expect(exportsWriteMethod("export async function GET() {}")).toBe(false)
    expect(
      hasAnyUseServerDirective(
        'export default function P() {\n  async function f() {\n    "use server"\n  }\n}'
      )
    ).toBe(true)
    expect(hasAnyUseServerDirective("// not a use server directive")).toBe(
      false
    )
  })
})
