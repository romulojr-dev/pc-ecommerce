import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

import { sourceFiles } from "@/test-support/admin-guard-scan"

// docs/specs/047-admin-audit-log-view, B3, R13: the audit log has no action,
// no route handler and nothing that posts. The append-only trigger is tested
// in audit-coverage.db.test.ts (E25).

const root = process.cwd()
const screen = sourceFiles(join(root, "app", "admin", "(shell)", "audit"))
const components = sourceFiles(join(root, "components", "admin")).filter(
  (path) => /audit-[a-z-]+\.tsx$/.test(path) && !path.endsWith(".test.tsx")
)

describe("the audit log is read-only", () => {
  test("there are files to check", () => {
    expect(screen.length).toBeGreaterThan(0)
    expect(components.length).toBeGreaterThan(0)
  })

  test("no server action, route handler or admin guard under the screen", () => {
    for (const path of [...screen, ...components]) {
      const source = readFileSync(path, "utf8")
      expect(source, path).not.toMatch(/["']use server["']/)
      expect(source, path).not.toMatch(/\badminAction\b|\badminRoute\b/)
      expect(source, path).not.toMatch(/\bmethod=["']post["']/i)
    }
    expect(screen.filter((p) => /route\.ts$/.test(p))).toEqual([])
    expect(screen.filter((p) => /actions\.ts$/.test(p))).toEqual([])
  })

  test("no route handler under app/api/admin mentions the audit log", () => {
    for (const path of sourceFiles(join(root, "app", "api", "admin"))) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(/auditLog/i)
    }
  })

  test("the query module only reads: no write call on AuditLog", () => {
    const source = readFileSync(
      join(root, "lib", "admin", "queries", "audit.ts"),
      "utf8"
    )
    expect(source).not.toMatch(
      /auditLog\.(create|createMany|update|updateMany|upsert|delete|deleteMany)/
    )
    expect(source).not.toMatch(/\$executeRaw|\$queryRawUnsafe/)
  })
})
