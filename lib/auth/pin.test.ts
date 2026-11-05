import { readFileSync } from "node:fs"

import { describe, expect, test } from "vitest"

// Better Auth guards the admin sign-in, so it is pinned exactly and updated
// as a group (docs/specs/039-staff-sign-in-admin-shell, T-pin, T-dependabot)

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

describe("the Better Auth pin", () => {
  const pkg = JSON.parse(read("package.json")) as {
    dependencies: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const all = { ...pkg.dependencies, ...pkg.devDependencies }

  test("better-auth is exactly 1.7.17, with no range", () => {
    expect(all["better-auth"]).toBe("1.7.17")
  })

  test("any @better-auth/* package that is listed is pinned exactly too", () => {
    for (const [name, range] of Object.entries(all)) {
      if (name.startsWith("@better-auth/")) {
        expect(range, name).toMatch(/^\d+\.\d+\.\d+$/)
      }
    }
  })
})

describe("dependabot.yml", () => {
  const text = read(".github/dependabot.yml")

  test("groups better-auth and @better-auth/* together", () => {
    expect(text).toMatch(/groups:\s+better-auth:/)
    const group = text.slice(text.indexOf("patterns:"))
    expect(group).toContain("- better-auth")
    expect(group).toContain('- "@better-auth/*"')
  })

  test("watches nothing else", () => {
    expect(text).toContain("dependency-name: better-auth")
    expect(text).toContain('dependency-name: "@better-auth/*"')
    expect(text.match(/dependency-name:/g)).toHaveLength(2)
  })
})
