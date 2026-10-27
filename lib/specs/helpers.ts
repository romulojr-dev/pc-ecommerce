import { z } from "zod"

// Building blocks shared by the category schemas in ./categories

// Spec numbers are whole numbers in base units (see spec.md, "Naming and
// units"). Strings are never coerced.
export const positiveInt = () => z.int().positive()
export const nonNegativeInt = () => z.int().nonnegative()

// A list where each value may appear once. Duplicates are reported on the
// repeated entry, e.g. path ["supportedSockets", 1].
export function uniqueList<T extends z.ZodType>(
  item: T,
  { nonEmpty = false }: { nonEmpty?: boolean } = {}
) {
  const list = z.array(item).check((ctx) => {
    const seen = new Set<unknown>()
    ctx.value.forEach((value, index) => {
      if (seen.has(value)) {
        ctx.issues.push({
          code: "custom",
          message: `duplicate value ${JSON.stringify(value)}`,
          input: value,
          path: [index],
        })
      }
      seen.add(value)
    })
  })
  return nonEmpty ? list.min(1, "must not be empty") : list
}

// One ID per row of the PRD compatibility rules table
export type RuleId =
  | "socket-match"
  | "memory-type"
  | "memory-slots"
  | "memory-capacity"
  | "form-factor"
  | "gpu-length"
  | "cooler-height"
  | "cooler-socket"
  | "radiator-fit"
  | "psu-wattage"
  | "psu-form-factor"
  | "m2-slots"
  | "integrated-graphics"
  | "bios-update"

// Sections of the spec table. Only categories with more than 8 fields are
// grouped (docs/specs/009-spec-table, "Grouping and order rule").
export type SpecGroup = "Processor" | "Memory" | "Size and connectivity"

// How a field filters a category listing (docs/specs/013-spec-filters):
// enum: checkboxes for the `options`, any of them; values: checkboxes for the
// values in stock (numbers or text), any of them; range: min and max;
// boolean: true only; contains: a list field holding any of the checked
// `options`
export type SpecFilterKind =
  "enum" | "values" | "range" | "boolean" | "contains"

// What the UI needs to know about a spec field: filters (FR-5), the spec
// table (FR-9) and admin forms (AD-2) all read this. Entry order in a
// FieldMetaMap is the display order.
export type FieldMeta = {
  label: string
  // Display unit, e.g. "mm" or "W"; omitted for counts, booleans and enums
  unit?: string
  // A friendlier unit for values of at least `per` base units, e.g.
  // { unit: "TB", per: 1000 } shows 2000 GB as "2 TB"
  largeUnit?: { unit: string; per: number }
  // Spec table section; all or none of a category's fields have one
  group?: SpecGroup
  // Absent: not a filter
  filter?: SpecFilterKind
  // Compatibility rules that read this field; such fields must be required
  rules?: readonly RuleId[]
  // Display labels for enum values, e.g. { MICRO_ATX: "Micro-ATX" }
  options?: Readonly<Record<string, string>>
}

// Every key of every member of a union, e.g. both air- and AIO-only cooler
// fields. Plain `keyof` on a union keeps only the keys they share.
type AllKeys<T> = T extends unknown ? keyof T : never

// Metadata for a schema: exactly one entry per field. Use with `satisfies`
// so a missing entry, or one for a field that no longer exists, fails the
// type check.
export type FieldMetaMap<S extends z.ZodType> = {
  [K in AllKeys<z.input<S>>]-?: FieldMeta
}
