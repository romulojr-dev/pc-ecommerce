import { join, relative, sep } from "node:path"

import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

import {
  fileHasUseServerDirective,
  scanModules,
  sourceFiles,
} from "@/test-support/admin-guard-scan"
import { AUDIT_FIXTURES } from "@/test-support/admin-audit-fixtures"
import {
  makeStaffUser,
  resetSignInIps,
  signInCookie,
} from "@/test-support/admin-session"
import { db, resetCatalog } from "@/test-support/db"

import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "./audit-data"
import { flattenAudit } from "./audit-diff"
import { demoRuleOf, formatRuleOf } from "./audit-keys"
import { isAdminAction, isReadAction } from "./permissions"

// docs/specs/047-admin-audit-log-view: every registered admin mutation writes
// an audit row (E26, E27, R11, R12), and every key those rows hold has both of
// its rules (R9, E24c).

let currentHeaders = new Headers()
vi.mock("next/headers", () => ({ headers: async () => currentHeaders }))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  },
}))
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
}))

// recordAudit runs as it does in production; when the flag is set it throws
// right after writing, so the test can see the change roll back with it
let failAfterAudit = false
vi.mock("@/lib/admin/audit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/admin/audit")>()
  return {
    ...real,
    recordAudit: async (
      ...args: Parameters<typeof real.recordAudit>
    ): Promise<void> => {
      await real.recordAudit(...args)
      if (failAfterAudit) throw new Error("forced after the audit row")
    },
  }
})

const root = process.cwd()
const OWNER = "audit-owner@example.com"

async function freshWorld() {
  resetSignInIps()
  failAfterAudit = false
  await resetCatalog()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
  const owner = await makeStaffUser(OWNER, "OWNER")
  currentHeaders = new Headers({ cookie: await signInCookie(OWNER) })
  return owner
}

type Call = (input: unknown) => Promise<{ ok: boolean; error?: string }>
async function actionOf(file: string, name: string): Promise<Call> {
  return (await import(/* @vite-ignore */ file))[name] as Call
}

const auditRows = () =>
  db.auditLog.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] })

// A fingerprint of every table an audited mutation could change
async function snapshot() {
  const out: Record<string, string> = {}
  for (const table of [
    "Product",
    "Order",
    "StockMovement",
    "EmailOutbox",
    "AuditLog",
  ]) {
    const [row] = await db.$queryRawUnsafe<{ n: bigint; h: string }[]>(
      `SELECT count(*) AS n,
              coalesce(md5(string_agg(t::text, '' ORDER BY t."id")), '') AS h
       FROM "${table}" t`
    )
    out[table] = `${row.n}:${row.h}`
  }
  return out
}

afterAll(() => db.$disconnect())
beforeEach(() => {
  failAfterAudit = false
})

describe("the registry matches the registered admin mutations", () => {
  test("E27: every marked write action has a fixture, and every fixture a real action", async () => {
    const modules = sourceFiles(join(root, "app", "admin"))
      .filter((path) => fileHasUseServerDirective(path))
      .map((path) => ({ path, kind: "actions" as const }))
    const { guarded } = await scanModules(modules)
    const writes = guarded.filter(
      (g) => !(isAdminAction(g.action) && isReadAction(g.action))
    )
    const key = (file: string, name: string) => `${file}::${name}`
    const wanted = new Set(writes.map((g) => key(g.file, g.export)))
    const have = new Set(AUDIT_FIXTURES.map((f) => key(f.file, f.export)))

    const missing = [...wanted].filter((k) => !have.has(k))
    const stale = [...have].filter((k) => !wanted.has(k))
    expect(
      missing,
      "a marked admin write action has no audit fixture in test-support/admin-audit-fixtures.ts"
    ).toEqual([])
    expect(stale, "a fixture names an action that no longer exists").toEqual([])
    expect(writes.length).toBeGreaterThan(0)
  })

  test("the only admin route handler is the photo upload, which has its own audit proof", () => {
    // The fixtures above run server actions. A route handler needs its own
    // proof of the audit row, the rollback and the refusal: add it to this
    // list only with a test like lib/admin/images/upload-route.db.test.ts
    // (docs/specs/049-product-images-upload, R9)
    const routes = sourceFiles(join(root, "app", "api", "admin"))
      .filter((p) => p.endsWith("route.ts"))
      .map((p) => relative(root, p).split(sep).join("/"))
    expect(
      routes,
      "an admin route handler exists: give it its own audit proof and list it here"
    ).toEqual(["app/api/admin/images/route.ts"])
  })
})

// The rows each fixture wrote, kept for the key test below
const written: { fixture: string; before: unknown; after: unknown }[] = []

describe.each(AUDIT_FIXTURES.map((f) => [f.export, f] as const))(
  "%s",
  (_name, fixture) => {
    test("E26: a valid call writes its audit row, as the Owner, in the closed lists", async () => {
      const owner = await freshWorld()
      const ctx = await fixture.setup()
      const before = new Set((await auditRows()).map((r) => r.id))
      const result = await (
        await actionOf(fixture.file, fixture.export)
      )(fixture.input(ctx))
      expect(result.ok, JSON.stringify(result)).toBe(true)

      const fresh = (await auditRows()).filter((r) => !before.has(r.id))
      expect(
        fresh.map((r) => ({ entity: r.entity, action: r.action }))
      ).toEqual(fixture.writes)
      for (const row of fresh) {
        expect(row.actorId).toBe(owner.id)
        expect(AUDIT_ENTITIES).toContain(row.entity)
        expect(AUDIT_ACTIONS).toContain(row.action)
        expect(row.entityId.length).toBeGreaterThan(0)
        written.push({
          fixture: fixture.export,
          before: row.before,
          after: row.after,
        })
      }
    })

    test("R11: a refused or unchanged call writes no audit row", async () => {
      await freshWorld()
      const ctx = await fixture.setup()
      const before = await snapshot()
      await (
        await actionOf(fixture.file, fixture.export)
      )(await fixture.refused(ctx))
      const after = await snapshot()
      expect(after.AuditLog).toBe(before.AuditLog)
    })

    test("R12: the change and its audit row commit or roll back together", async () => {
      await freshWorld()
      const ctx = await fixture.setup()
      const before = await snapshot()
      failAfterAudit = true
      try {
        await (
          await actionOf(fixture.file, fixture.export)
        )(fixture.input(ctx))
      } catch {
        // A thrown error or an { ok: false } answer: either way nothing stays
      }
      failAfterAudit = false
      expect(await snapshot()).toEqual(before)
    })
  }
)

describe("R9: every key a writer produced has a format rule and a Demo rule", () => {
  test("E24c: none is missing", () => {
    // The describe.each above filled `written` (tests in a file run in order)
    expect(written.length).toBeGreaterThan(0)
    const problems: string[] = []
    for (const row of written) {
      for (const side of [row.before, row.after]) {
        for (const path of flattenAudit(side).keys()) {
          if (formatRuleOf(path) === null) {
            problems.push(`${row.fixture}: "${path}" has no format rule`)
          }
          if (demoRuleOf(path) === null) {
            problems.push(`${row.fixture}: "${path}" has no Demo rule`)
          }
        }
      }
    }
    expect([...new Set(problems)]).toEqual([])
  })
})

describe("E25: AuditLog is append-only", () => {
  test("a row made by recordAudit cannot be updated or deleted, by Prisma or SQL; TRUNCATE still works", async () => {
    const owner = await freshWorld()
    const { adminTransaction, recordAudit } =
      await vi.importActual<typeof import("@/lib/admin/audit")>(
        "@/lib/admin/audit"
      )
    await adminTransaction((tx) =>
      recordAudit(tx, {
        actorId: owner.id,
        entity: "product",
        entityId: "p1",
        action: "updated",
        before: { stock: 1 },
        after: { stock: 2 },
      })
    )
    const [row] = await auditRows()
    await expect(
      db.auditLog.update({ where: { id: row.id }, data: { action: "deleted" } })
    ).rejects.toThrow()
    await expect(
      db.auditLog.delete({ where: { id: row.id } })
    ).rejects.toThrow()
    await expect(
      db.$executeRaw`UPDATE "AuditLog" SET "action" = 'deleted'`
    ).rejects.toThrow()
    await expect(db.$executeRaw`DELETE FROM "AuditLog"`).rejects.toThrow()
    expect(await db.auditLog.count()).toBe(1)

    await db.$executeRaw`TRUNCATE TABLE "AuditLog"`
    expect(await db.auditLog.count()).toBe(0)
  })
})
