import { z } from "zod"
import { describe, expect, test } from "vitest"

import {
  builderCategories,
  fieldSchemas,
  isTextField,
  type BuilderCategorySlug,
  type FieldMeta,
  type SpecFilterKind,
} from "@/lib/specs"

// Field metadata checks (docs/specs/009-spec-table). FieldMetaMap already
// makes a missing entry a type error; this also catches what types don't:
// enum labels, units, the grouping rule and filter kinds.

// String values of an enum, a list of enums or a string literal (the cooler
// `type`, one literal per branch); undefined for any other field
function enumValues(schemas: z.ZodType[]) {
  const values = schemas.flatMap((field) => {
    const item = field instanceof z.ZodArray ? field.element : field
    if (item instanceof z.ZodEnum) return item.options.map(String)
    if (item instanceof z.ZodLiteral) {
      return [...item.values].filter((value) => typeof value === "string")
    }
    return []
  })
  return values.length > 0 ? [...new Set(values)] : undefined
}

// Spec field names end in their base unit (spec 001, "Naming and units")
const UNIT_SUFFIX = /(Mm|W|Gb|Mhz|Mts)$/

const categories = Object.entries(builderCategories).map(
  ([slug, { schema, fields }]) => ({
    slug,
    schemaFields: fieldSchemas(schema),
    meta: Object.entries(fields as Record<string, FieldMeta>),
  })
)

describe.each(categories)("$slug", ({ schemaFields, meta }) => {
  test("has metadata for exactly the schema's fields", () => {
    expect(meta.map(([key]) => key).sort()).toEqual(
      [...schemaFields.keys()].sort()
    )
  })

  test("labels every enum value, and only enum fields have options", () => {
    for (const [key, { options }] of meta) {
      const values = enumValues(schemaFields.get(key)!)
      expect(options && Object.keys(options).sort(), `${key} options`).toEqual(
        values?.sort()
      )
    }
  })

  test("gives a unit to every field named with one", () => {
    const missing = meta
      .filter(([key, { unit }]) => UNIT_SUFFIX.test(key) && !unit)
      .map(([key]) => key)
    expect(missing).toEqual([])
  })

  // docs/specs/013-spec-filters, "Filter kinds and fields"
  test("gives each filter a kind that fits its field", () => {
    const misfits = meta.flatMap(([key, { filter, options }]) => {
      if (!filter) return []
      const schemas = schemaFields.get(key)!
      const fits = (test: (schema: z.ZodType) => boolean) => schemas.every(test)
      const isNumber = (schema: z.ZodType) =>
        schema instanceof z.ZodNumber ||
        (schema instanceof z.ZodLiteral &&
          [...schema.values].every((value) => typeof value === "number"))
      const ok: Record<SpecFilterKind, boolean> = {
        enum: options !== undefined && !fits((s) => s instanceof z.ZodArray),
        contains: options !== undefined && fits((s) => s instanceof z.ZodArray),
        boolean: fits((s) => s instanceof z.ZodBoolean),
        range: fits(isNumber),
        values: fits((s) => isNumber(s) || s instanceof z.ZodString),
      }
      return ok[filter] ? [] : [`${key}: ${filter}`]
    })
    expect(misfits).toEqual([])
  })

  test("has unique labels", () => {
    const labels = meta.map(([, { label }]) => label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  test("follows the grouping rule", () => {
    const groups = meta.map(([, { group }]) => group)
    const grouped = groups.filter((group) => group !== undefined)
    if (grouped.length === 0) return

    // Groups only above 8 fields, and then on every field
    expect(meta.length).toBeGreaterThan(8)
    expect(grouped.length).toBe(meta.length)
    // Each group's fields are contiguous, and a group has at least 2
    const runs = groups.filter((group, i) => group !== groups[i - 1])
    expect(new Set(runs).size, "contiguous groups").toBe(runs.length)
    for (const run of runs) {
      expect(
        grouped.filter((group) => group === run).length,
        `${run} size`
      ).toBeGreaterThanOrEqual(2)
    }
  })
})

describe("isTextField", () => {
  test.each<[BuilderCategorySlug, string, boolean]>([
    ["gpu", "chipset", true],
    ["motherboard", "chipset", true],
    ["memory", "capacityGb", false],
    ["cpu-cooler", "radiatorSizeMm", false],
    ["gpu", "chipsetBrand", false],
  ])("%s.%s is text: %s", (category, field, expected) => {
    expect(isTextField(category, field)).toBe(expected)
  })
})
