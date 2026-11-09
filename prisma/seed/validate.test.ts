import { assert, describe, expect, test } from "vitest"

import { builderCategories, type FieldMeta } from "@/lib/specs"

import { seedFiles } from "./data"
import { formatErrors } from "./format-errors"
import { findReservedCategorySlugs, validateSeed } from "./validate"

type RawPart = { sku: string; specs: Record<string, unknown> }

// One case per spec field that a compatibility rule reads (FieldMeta.rules),
// so a field is covered as soon as it is tagged with a rule. The base part is
// the first seed part that has the field: union schemas (air vs AIO coolers)
// don't put every field on every part.
const ruleFieldCases = seedFiles.flatMap(({ file, category, parts }) => {
  const fields: Record<string, FieldMeta> = builderCategories[category].fields
  return Object.entries(fields)
    .filter(([, meta]) => meta.rules?.length)
    .map(([field, meta]) => ({
      category,
      field,
      rules: meta.rules!.join(", "),
      file,
      part: (parts as readonly RawPart[]).find((part) =>
        Object.hasOwn(part.specs, field)
      ),
    }))
})

describe("seed catalog", () => {
  test("every seed data file validates against its category schema", () => {
    const result = validateSeed(seedFiles)
    expect(result.ok, result.ok ? undefined : formatErrors(result.errors)).toBe(
      true
    )
  })

  test("covers every builder category", () => {
    expect(seedFiles.map(({ category }) => category).sort()).toEqual(
      Object.keys(builderCategories).sort()
    )
  })

  test.each(ruleFieldCases)(
    "$category: rejects a part without specs.$field ($rules)",
    ({ category, field, file, part }) => {
      if (!part) {
        assert.fail(`${category}.${field}: no seed part has this field`)
      }
      const withoutField = structuredClone(part)
      delete withoutField.specs[field]

      const result = validateSeed([{ file, category, parts: [withoutField] }])

      expect(result).toMatchObject({
        ok: false,
        errors: expect.arrayContaining([
          expect.objectContaining({
            index: 0,
            sku: part.sku,
            path: ["specs", field],
          }),
        ]),
      })
    }
  )
})

describe("reserved category slugs", () => {
  test("rejects a category slug that is a top-level route", () => {
    expect(findReservedCategorySlugs(["gpu", "cart"])).toEqual([
      'Category slug "cart" is reserved for a top-level route (lib/reserved-slugs.ts)',
    ])
  })

  test("accepts every builder category slug", () => {
    expect(findReservedCategorySlugs(Object.keys(builderCategories))).toEqual(
      []
    )
  })
})

describe("box contents and pre-order", () => {
  const { file, parts } = seedFiles.find(({ category }) => category === "cpu")!
  const base = parts[0] as RawPart

  function validatePart(fields: Record<string, unknown>) {
    const part = { ...structuredClone(base), ...fields }
    return validateSeed([{ file, category: "cpu", parts: [part] }])
  }

  test("accepts a ship date and box contents", () => {
    const result = validatePart({
      preorderShipsOn: "2027-01-15",
      boxContents: ["Processor", "Case badge"],
    })
    assert(result.ok)
    expect(result.files[0].parts[0]).toMatchObject({
      preorderShipsOn: "2027-01-15",
      boxContents: ["Processor", "Case badge"],
    })
  })

  test.each(["2027-13-01", "15/01/2027", "2027-01-15T00:00:00Z"])(
    "rejects the ship date %s",
    (preorderShipsOn) => {
      expect(validatePart({ preorderShipsOn })).toMatchObject({
        ok: false,
        errors: [{ path: ["preorderShipsOn"] }],
      })
    }
  )

  test("rejects an empty box contents item", () => {
    expect(validatePart({ boxContents: ["Processor", " "] })).toMatchObject({
      ok: false,
      errors: [{ path: ["boxContents", 1] }],
    })
  })
})
