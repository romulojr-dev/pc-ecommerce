import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, test } from "vitest"

// docs/specs/039-staff-sign-in-admin-shell, R7, D9: the proxy is not a
// boundary, so every page and layout under app/admin (the sign-in form
// excepted) must call requireAdminSession itself. A forgotten call fails here.

const adminRoot = join(process.cwd(), "app", "admin")

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

function guardedFiles() {
  return files(adminRoot)
    .filter((path) => /(^|[\\/])(page|layout)\.tsx$/.test(path))
    .filter((path) => {
      const parts = relative(adminRoot, path).split(/[\\/]/)
      return parts[0] !== "login"
    })
}

describe("every admin page and layout", () => {
  test("there is at least one to check", () => {
    expect(guardedFiles().length).toBeGreaterThan(0)
  })

  test.each(guardedFiles().map((path) => relative(process.cwd(), path)))(
    "%s calls requireAdminSession or requireAdminAccess",
    (path) => {
      const source = readFileSync(join(process.cwd(), path), "utf8")
      expect(source).toMatch(/requireAdmin(Session|Access)\s*\(/)
    }
  )

  test("every admin page and layout is per request", () => {
    for (const path of files(adminRoot).filter((p) =>
      /(^|[\\/])(page|layout)\.tsx$/.test(p)
    )) {
      const source = readFileSync(path, "utf8")
      expect(source, path).toMatch(/connection\s*\(/)
    }
  })
})
