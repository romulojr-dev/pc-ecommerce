import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { assert, describe, expect, test } from "vitest"

import { PLACEHOLDER_VIEWS, placeholderUrl } from "@/lib/placeholders"
import { builderCategories } from "@/lib/specs"
import { getStockStatus } from "@/lib/stock"

import { validateSeed } from "../validate"
import { seedFiles } from "."

// Catalog minimums from docs/specs/005-expand-seed-catalog/spec.md
// ("Coverage"). Runs on validated parts, so defaults (lowStockAt) are filled.
const validation = validateSeed(seedFiles)
if (!validation.ok) assert.fail("seed data is invalid; see validate.test.ts")
const files = validation.files
const parts = files.flatMap((file) => file.parts)

// Spec 001's fixture set: its compatible builds and incompatible pairs
// depend on these parts
const FIXTURE_SKUS = [
  "100-100001015BOX",
  "100-100001084WOF",
  "BX8071514400F",
  "90MB1BP0-M0AAY0",
  "B650I LIGHTNING WIFI",
  "PRO B760M-A WIFI DDR4",
  "CMK32GX5M2B6000C30",
  "KF432C16BBK2/16",
  "MZ-V9P1T0BW",
  "WDS200T2X0E",
  "CT1000MX500SSD1",
  "DUAL-RTX4060-O8G",
  "GV-N5070WF3OC-12GD",
  "ROG-ASTRAL-RTX5090-O32G-GAMING",
  "LAN216X",
  "MCB-Q300L-KANN-S00",
  "FD-C-RID1N-11",
  "MPE-5501-ACAAB",
  "CP-9020263-NA",
  "CP-9020186-NA",
  "PA120 SE",
  "NH-L9a-AM5",
  "ACFRE00136A",
]

describe("catalog coverage", () => {
  test("has 55–65 parts", () => {
    expect(parts.length).toBeGreaterThanOrEqual(55)
    expect(parts.length).toBeLessThanOrEqual(65)
  })

  test.each(files)("$category has at least 6 parts", ({ parts }) => {
    expect(parts.length).toBeGreaterThanOrEqual(6)
  })

  test.each(files)(
    "$category has at least 3 brands (2 for cpu)",
    ({ category, parts }) => {
      const brands = new Set(parts.map((part) => part.brandSlug))
      expect(brands.size).toBeGreaterThanOrEqual(category === "cpu" ? 2 : 3)
    }
  )

  test("has at least 3 out-of-stock, 5 low-stock and 2 pre-order parts", () => {
    // A fixed day before the seeded ship dates, so the test doesn't age
    const statuses = parts.map((part) =>
      getStockStatus(
        { ...part, preorderShipsOn: part.preorderShipsOn ?? null },
        "2026-10-26"
      )
    )
    expect(
      statuses.filter((status) => status === "out-of-stock").length
    ).toBeGreaterThanOrEqual(3)
    expect(
      statuses.filter((status) => status === "low-stock").length
    ).toBeGreaterThanOrEqual(5)
    expect(
      statuses.filter((status) => status === "pre-order").length
    ).toBeGreaterThanOrEqual(2)
  })

  test("has 4–8 parts on sale", () => {
    const onSale = parts.filter((part) => part.salePrice !== undefined)
    expect(onSale.length).toBeGreaterThanOrEqual(4)
    expect(onSale.length).toBeLessThanOrEqual(8)
  })

  test("has a PSU of at least 1000 W", () => {
    const psus = files.find((file) => file.category === "psu")!.parts
    const wattages = psus.map(
      (part) => (part.specs as { wattageW: number }).wattageW
    )
    expect(Math.max(...wattages)).toBeGreaterThanOrEqual(1000)
  })

  test("has 5–6 parts with several images, with 2 and with 3", () => {
    const counts = parts
      .map((part) => part.images.length)
      .filter((count) => count > 1)
    expect(counts.length).toBeGreaterThanOrEqual(5)
    expect(counts.length).toBeLessThanOrEqual(6)
    expect(counts).toContain(2)
    expect(counts).toContain(3)
  })

  test("keeps every spec 001 fixture part", () => {
    const skus = new Set(parts.map((part) => part.sku))
    expect(FIXTURE_SKUS.filter((sku) => !skus.has(sku))).toEqual([])
  })
})

describe("image files", () => {
  const publicDir = fileURLToPath(new URL("../../../public", import.meta.url))
  const isFile = (url: string) => existsSync(`${publicDir}${url}`)

  test("every local image the seed uses exists under public/", () => {
    const missing = parts
      .flatMap((part) => part.images.map((image) => image.url))
      .filter((url) => url.startsWith("/") && !isFile(url))
    expect([...new Set(missing)]).toEqual([])
  })

  test("every builder category and view has a placeholder", () => {
    const names = [
      ...Object.keys(builderCategories),
      ...Object.keys(PLACEHOLDER_VIEWS),
    ]
    expect(names.map(placeholderUrl).filter((url) => !isFile(url))).toEqual([])
  })
})
