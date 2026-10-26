import { z } from "zod"
import { describe, expect, test } from "vitest"

import { builderCategories, type FieldMeta } from "@/lib/specs"

// Field metadata checks (docs/specs/009-spec-table). FieldMetaMap already
// makes a missing entry a type error; this also catches what types don't:
// enum labels, units and the grouping rule.

// Each field's schemas by key, one per branch of the cooler union that has
// it. Optional wrappers are unwrapped; z.never placeholders (a field of the
// other cooler type) are skipped.
function fieldSchemas(schema: z.ZodType) {
  const objects =
    schema instanceof z.ZodDiscriminatedUnion ? schema.options : [schema]
  const fields = new Map<string, z.ZodType[]>()
  for (const object of objects as z.ZodObject[]) {
    for (const [key, field] of Object.entries(object.shape)) {
      const inner = field instanceof z.ZodOptional ? field.unwrap() : field
      if (inner instanceof z.ZodNever) continue
      fields.set(key, [...(fields.get(key) ?? []), inner as z.ZodType])
    }
  }
  return fields
}

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
