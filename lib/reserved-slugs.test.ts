import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, test } from "vitest"

import { isReservedSlug, RESERVED_SLUGS } from "./reserved-slugs"

// Static top-level route folders under app/: route groups like (store) are
// looked into; dynamic [x], private _x and parallel @x folders are skipped
function topLevelRoutes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      if (/^\(.+\)$/.test(entry.name)) {
        return topLevelRoutes(`${dir}/${entry.name}`)
      }
      return /^[[_@]/.test(entry.name) ? [] : [entry.name]
    })
}

describe("isReservedSlug", () => {
  test("matches reserved names exactly", () => {
    expect(isReservedSlug("cart")).toBe(true)
    expect(isReservedSlug("cart-accessories")).toBe(false)
    expect(isReservedSlug("gpu")).toBe(false)
  })
})

describe("RESERVED_SLUGS", () => {
  test("has no duplicates", () => {
    expect(new Set(RESERVED_SLUGS).size).toBe(RESERVED_SLUGS.length)
  })

  test("every entry is a valid slug", () => {
    for (const slug of RESERVED_SLUGS) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  test("includes every top-level route in app/", () => {
    const routes = topLevelRoutes(
      fileURLToPath(new URL("../app", import.meta.url))
    )
    const missing = routes.filter((route) => !isReservedSlug(route))
    expect(
      missing,
      `Add to RESERVED_SLUGS in lib/reserved-slugs.ts: ${missing.join(", ")}`
    ).toEqual([])
  })
})
