import { readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"

import { describe, expect, test } from "vitest"

import { sourceFiles } from "@/test-support/admin-guard-scan"

// docs/specs/040-admin-permissions-audit-masking, R19, T12: admin pages and
// components read data only through lib/admin/queries (which take the role and
// mask for Demo); none imports the database client.

const root = process.cwd()
const files = [
  ...sourceFiles(join(root, "app", "admin")),
  ...sourceFiles(join(root, "components", "admin")),
].filter((path) => !/\.test\.tsx?$/.test(path))

const DB_IMPORT =
  /from\s+["'](@\/lib\/db|@\/generated\/prisma[^"']*|\.{1,2}\/[^"']*\/db)["']/

describe("admin pages and components", () => {
  test("there are files to check", () => {
    expect(files.length).toBeGreaterThan(0)
  })

  test("none imports the database client or the generated client's runtime", () => {
    const offenders = files
      .filter((path) => {
        const source = readFileSync(path, "utf8")
        // A type-only import of the generated types is fine
        return source
          .split("\n")
          .some(
            (line) => DB_IMPORT.test(line) && !/^\s*import\s+type\b/.test(line)
          )
      })
      .map((path) => relative(root, path).split(sep).join("/"))
    expect(offenders).toEqual([])
  })

  test("the pattern does catch an import of db", () => {
    expect(DB_IMPORT.test('import { db } from "@/lib/db"')).toBe(true)
    expect(DB_IMPORT.test('import { db } from "../../lib/db"')).toBe(true)
    expect(
      DB_IMPORT.test('import { x } from "@/lib/admin/queries/orders"')
    ).toBe(false)
  })
})
