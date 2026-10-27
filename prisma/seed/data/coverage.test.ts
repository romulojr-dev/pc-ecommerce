import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { assert, describe, expect, test } from "vitest"

import { PLACEHOLDER_VIEWS, placeholderUrl } from "@/lib/placeholders"
import { builderCategories, type BuilderCategorySlug } from "@/lib/specs"
import type { FieldMeta } from "@/lib/specs/helpers"
import { getStockStatus } from "@/lib/stock"

import { validateSeed } from "../validate"
import { seedFiles } from "."

// Catalog rules from docs/specs/011-seed-150/spec.md. Runs on validated
// parts, so defaults (lowStockAt, warrantyMonths) are filled.
const validation = validateSeed(seedFiles)
if (!validation.ok) assert.fail("seed data is invalid; see validate.test.ts")
const files = validation.files
const parts = files.flatMap((file) => file.parts)
type Part = (typeof parts)[number]

// A fixed day before the seeded ship dates, so the test doesn't age
const TODAY = "2026-10-26"

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

// The 37 parts spec 005 added. Production already has all 60, and a re-seed
// leaves their price, stock and status alone, so they must stay in the data.
const SPEC_005_SKUS = [
  "100-100000927BOX",
  "BX8071514100F",
  "BX80768245K",
  "BX80768265K",
  "100-100001277WOF",
  "TUF GAMING B550-PLUS WIFI II",
  "B650M-HDV/M.2",
  "PRIME B760M-A WIFI",
  "TUF GAMING B860-PLUS WIFI",
  "X870E AORUS ELITE WIFI7",
  "CMK16GX4M2B3200C16",
  "KF556C40BB-16",
  "F5-6000J3038F16GX2-FX5",
  "FFRD532G6000HC30DC01",
  "F5-6400J3239G32GX2-TZ5RK",
  "SNV3S/1000G",
  "CT2000T705SSD3",
  "MZ-77E500B/AM",
  "ST2000DM008",
  "GV-N3050OC-6GL",
  "31P06HB0BA",
  "11324-01-20G",
  "GeForce RTX 5060 Ti 16G VENTUS 2X OC PLUS",
  "11348-03-20G",
  "TUF-RTX5080-O16G-GAMING",
  "AIR 100 ARGB BLACK",
  "CC-9011200-WW",
  "CC-H52FB-01",
  "O11DEX",
  "MAG A650BN",
  "SSR-1000FX3",
  "BN755",
  "SP850",
  "SE-224-XT ARGB V3",
  "R-AK400-BKNNMN-G-1",
  "NH-D15 G2",
  "RL-KN240-B1",
]

// Price tier boundaries in centavos: [start of mid, start of high]. The
// same numbers are in each data file's header comment; keep them in step.
const TIERS: Record<BuilderCategorySlug, [number, number]> = {
  cpu: [900_000, 1_800_000],
  motherboard: [900_000, 1_500_000],
  memory: [350_000, 650_000],
  storage: [400_000, 1_000_000],
  gpu: [2_000_000, 5_000_000],
  case: [400_000, 650_000],
  psu: [400_000, 900_000],
  "cpu-cooler": [250_000, 650_000],
}
// Fewer SKUs sell in these, so a tier needs fewer parts
const SMALL_CATEGORIES: BuilderCategorySlug[] = ["case", "psu", "cpu-cooler"]

const statusOf = (part: Part) =>
  getStockStatus(
    { ...part, preorderShipsOn: part.preorderShipsOn ?? null },
    TODAY
  )

const count = <T>(items: T[], test: (item: T) => boolean) =>
  items.filter(test).length

// How many categories the given parts come from
const categoryCount = (selected: Part[]) =>
  files.filter((file) => file.parts.some((part) => selected.includes(part)))
    .length

describe("catalog size and brands", () => {
  test("has 145–155 parts", () => {
    expect(parts.length).toBeGreaterThanOrEqual(145)
    expect(parts.length).toBeLessThanOrEqual(155)
  })

  test.each(files)("$category has at least 10 parts", ({ parts }) => {
    expect(parts.length).toBeGreaterThanOrEqual(10)
  })

  test.each(files)(
    "$category has 3–6 brands, none above 40% (cpu: AMD and Intel, none above 60%)",
    ({ category, parts }) => {
      const perBrand = new Map<string, number>()
      for (const part of parts) {
        perBrand.set(part.brandSlug, (perBrand.get(part.brandSlug) ?? 0) + 1)
      }
      if (category === "cpu") {
        expect([...perBrand.keys()].sort()).toEqual(["amd", "intel"])
      } else {
        expect(perBrand.size).toBeGreaterThanOrEqual(3)
        expect(perBrand.size).toBeLessThanOrEqual(6)
      }
      const cap = category === "cpu" ? 0.6 : 0.4
      const tooBig = [...perBrand]
        .filter(([, n]) => n / parts.length > cap)
        .map(([brand, n]) => `${brand} ${n}/${parts.length}`)
      expect(tooBig).toEqual([])
    }
  )
})

describe("filterable spec fields", () => {
  // Every field with a filter kind in the display metadata is checked, so
  // the data follows the metadata when it changes
  test.each(files)("$category gives each filter real choices", (file) => {
    const fields: Record<string, FieldMeta> =
      builderCategories[file.category].fields
    const problems: string[] = []

    for (const [name, meta] of Object.entries(fields)) {
      if (!meta.filter) continue
      // Parts without the field (radiator size on an air cooler) are skipped.
      // Array fields count each listed value once per part.
      const perValue = new Map<unknown, number>()
      for (const part of file.parts) {
        const raw = (part.specs as Record<string, unknown>)[name]
        if (raw === undefined) continue
        for (const value of Array.isArray(raw) ? raw : [raw]) {
          perValue.set(value, (perValue.get(value) ?? 0) + 1)
        }
      }
      const values = [...perValue.keys()]
      const found = `${file.category}.${name}: found ${JSON.stringify([
        ...perValue,
      ])}`

      const isBoolean = values.every((value) => typeof value === "boolean")

      if (meta.filter === "range") {
        if (values.length < 4) {
          problems.push(`${found}; a range needs 4 distinct values`)
        }
        continue
      }

      // Checkbox filter (enum, values, boolean, contains): 3 values, or every
      // value when it allows fewer
      const allowed = isBoolean
        ? 2
        : meta.options
          ? Object.keys(meta.options).length
          : 3
      if (values.length < Math.min(3, allowed)) {
        problems.push(`${found}; needs ${Math.min(3, allowed)} distinct values`)
      }
      // A two-value filter must visibly narrow the list either way
      if (allowed < 3 && [...perValue.values()].some((n) => n < 3)) {
        problems.push(`${found}; each value needs at least 3 parts`)
      }
    }
    expect(problems).toEqual([])
  })
})

describe("prices", () => {
  test.each(files)("$category spans budget, mid and high", (file) => {
    const [midFrom, highFrom] = TIERS[file.category]
    const prices = file.parts.map((part) => part.price)
    const tiers = {
      budget: count(prices, (price) => price < midFrom),
      mid: count(prices, (price) => price >= midFrom && price < highFrom),
      high: count(prices, (price) => price >= highFrom),
    }
    const needed = SMALL_CATEGORIES.includes(file.category) ? 2 : 3
    const thin = Object.entries(tiers).filter(([, n]) => n < needed)
    expect(thin, `tiers: ${JSON.stringify(tiers)}`).toEqual([])
    expect(Math.max(...prices)).toBeGreaterThanOrEqual(3 * Math.min(...prices))
  })
})

describe("stock, sale prices and pre-orders", () => {
  const withStatus = (status: string) =>
    parts.filter((part) => statusOf(part) === status)

  test("at least 70% of parts, and 50% of each category, are in stock", () => {
    expect(withStatus("in-stock").length / parts.length).toBeGreaterThanOrEqual(
      0.7
    )
    const thin = files
      .filter(
        ({ parts }) =>
          count(parts, (part) => statusOf(part) === "in-stock") / parts.length <
          0.5
      )
      .map((file) => file.category)
    expect(thin).toEqual([])
  })

  test("has at least 8 out-of-stock parts, in at least 4 categories", () => {
    const selected = withStatus("out-of-stock")
    expect(selected.length).toBeGreaterThanOrEqual(8)
    expect(categoryCount(selected)).toBeGreaterThanOrEqual(4)
  })

  test("has at least 15 low-stock parts, in at least 5 categories", () => {
    const selected = withStatus("low-stock")
    expect(selected.length).toBeGreaterThanOrEqual(15)
    expect(categoryCount(selected)).toBeGreaterThanOrEqual(5)
  })

  test("has at least 5 pre-order parts, in at least 3 categories", () => {
    const selected = withStatus("pre-order")
    expect(selected.length).toBeGreaterThanOrEqual(5)
    expect(categoryCount(selected)).toBeGreaterThanOrEqual(3)
  })

  test("has 12–20 parts on sale, each 5–25% off", () => {
    const onSale = parts.filter((part) => part.salePrice !== undefined)
    expect(onSale.length).toBeGreaterThanOrEqual(12)
    expect(onSale.length).toBeLessThanOrEqual(20)
    const badDiscount = onSale
      .filter((part) => {
        const off = 1 - part.salePrice! / part.price
        return off < 0.05 || off > 0.25
      })
      .map((part) => part.sku)
    expect(badDiscount).toEqual([])
  })

  test.each(files)(
    "$category has a part on sale that can be bought",
    ({ category, parts }) => {
      const buyable = count(
        parts,
        (part) =>
          part.salePrice !== undefined && statusOf(part) !== "out-of-stock"
      )
      const needed = ["cpu", "gpu", "memory", "storage"].includes(category)
        ? 2
        : 1
      expect(buyable).toBeGreaterThanOrEqual(needed)
    }
  )
})

describe("part quality and builder scenarios", () => {
  // The 60 existing parts keep what they have; 34 of them list no box contents
  test("every new part lists its box contents and a warranty of 12+ months", () => {
    const existing = new Set([...FIXTURE_SKUS, ...SPEC_005_SKUS])
    const bad = parts
      .filter((part) => !existing.has(part.sku))
      .filter(
        (part) =>
          (part.boxContents?.length ?? 0) === 0 || part.warrantyMonths < 12
      )
      .map((part) => part.sku)
    expect(bad).toEqual([])
  })

  test("has a PSU of at least 1200 W", () => {
    const psus = files.find((file) => file.category === "psu")!.parts
    const wattages = psus.map(
      (part) => (part.specs as { wattageW: number }).wattageW
    )
    expect(Math.max(...wattages)).toBeGreaterThanOrEqual(1200)
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

  test("keeps all 60 existing parts (spec 001 fixtures and spec 005)", () => {
    const existing = [...FIXTURE_SKUS, ...SPEC_005_SKUS]
    expect(new Set(existing).size).toBe(60)
    const skus = new Set(parts.map((part) => part.sku))
    expect(existing.filter((sku) => !skus.has(sku))).toEqual([])
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
