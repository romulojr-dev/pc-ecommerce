import {
  type BuilderCategorySlug,
  type FieldMeta,
  formatSpecValue,
  isTextField,
  type SpecFilterKind,
} from "@/lib/specs"

import { all, first } from "./raw"
import type { Facet, ListingFilter, SpecFilterInfo } from "./types"

// Spec filters (docs/specs/013-spec-filters): one listing filter per field
// with a `filter` kind in the display metadata, keyed by the field name. The
// field names come from the metadata, never from the URL.

// enum, contains and values: the checked values, as they appear in the URL
export type SpecChoiceFilterValue = string[]
// range: whole numbers in the field's base unit; either bound may be missing
export type SpecRangeFilterValue = { min: number | null; max: number | null }
// boolean: true only
export type SpecBooleanFilterValue = true

// More than this is never a real selection
const MAX_VALUES = 20
const MAX_TEXT_LENGTH = 60
// Whole numbers without leading zeros, small enough for any spec field
const INTEGER = /^(0|[1-9]\d{0,6})$/

// "min" + "vramGb" -> "minVramGb", like the price filter's minPrice
function rangeKey(bound: "min" | "max", field: string): string {
  return bound + field[0].toUpperCase() + field.slice(1)
}

// The URL keys a spec filter reads and writes
export function specParamKeys(field: string, kind: SpecFilterKind): string[] {
  return kind === "range"
    ? [rangeKey("min", field), rangeKey("max", field)]
    : [field]
}

function parseInteger(value: string | undefined): number | null {
  return value !== undefined && INTEGER.test(value) ? Number(value) : null
}

// One value as shoppers read it: "AM5", "Micro-ATX", "32 GB", "GeForce RTX 5070"
export function specValueLabel(info: SpecFilterInfo, value: string): string {
  if (info.text) return value
  const isNumber = info.kind === "values" || info.kind === "range"
  const typed = isNumber ? Number(value) : value
  return formatSpecValue(info.meta, typed) ?? value
}

// The values one product has for the field: one per list item for contains,
// "1" for a true boolean, none when the field is missing (an air cooler has
// no radiator size)
function specFacet(info: SpecFilterInfo): Facet {
  const { field, meta, kind, text } = info
  const order = Object.keys(meta.options ?? {})
  const compare: Facet["compare"] =
    kind === "enum" || kind === "contains"
      ? (a, b) => order.indexOf(a.value) - order.indexOf(b.value)
      : text
        ? (a, b) => a.value.localeCompare(b.value, "en")
        : (a, b) => Number(a.value) - Number(b.value)

  return {
    values(row) {
      const specs = row.specs
      if (typeof specs !== "object" || specs === null) return []
      const raw = (specs as Record<string, unknown>)[field]
      if (raw === undefined || raw === null) return []
      if (kind === "boolean") {
        return raw === true ? [{ value: "1", label: meta.label }] : []
      }
      return [raw].flat().map((item) => {
        const value = String(item)
        return { value, label: specValueLabel(info, value) }
      })
    },
    compare,
  }
}

// enum, contains and values: repeated keys, any of the values
function choiceFilter(
  info: SpecFilterInfo
): ListingFilter<SpecChoiceFilterValue> {
  const { field, meta, kind, text } = info
  // enum and contains take the metadata's options, in their order
  const order = kind === "values" ? null : Object.keys(meta.options ?? {})

  const isValid = (value: string) =>
    order
      ? order.includes(value)
      : text
        ? value.length > 0 && value.length <= MAX_TEXT_LENGTH
        : INTEGER.test(value)

  const sorted = (values: string[]) =>
    order
      ? order.filter((value) => values.includes(value))
      : text
        ? values.toSorted()
        : values.toSorted((a, b) => Number(a) - Number(b))

  return {
    key: field,
    spec: info,
    facet: specFacet(info),

    parse(raw) {
      const values = all(raw, field)
        .map((value) => (text ? value.trim() : value))
        .filter(isValid)
      const unique = sorted([...new Set(values)]).slice(0, MAX_VALUES)
      return unique.length > 0 ? unique : null
    },

    serialize(values) {
      return values.map((value) => [field, value])
    },

    chips(values) {
      return values.map((value) => {
        const rest = values.filter((other) => other !== value)
        return {
          label: `${meta.label}: ${specValueLabel(info, value)}`,
          without: rest.length > 0 ? rest : null,
        }
      })
    },

    // Drops values the category doesn't have (parsing can't know them)
    normalize(values, options) {
      const known = values.filter((value) =>
        options.some((option) => option.value === value)
      )
      return known.length > 0 ? known : null
    },
  }
}

// range: ?minVramGb=12&maxVramGb=16. Each bound stands alone, a minimum of 0
// is no minimum, and bounds in the wrong order are swapped, like price.
function rangeFilter(
  info: SpecFilterInfo
): ListingFilter<SpecRangeFilterValue> {
  const { field, meta } = info
  const minKey = rangeKey("min", field)
  const maxKey = rangeKey("max", field)
  const format = (value: number) =>
    formatSpecValue(meta, value) ?? String(value)

  return {
    key: field,
    spec: info,
    facet: specFacet(info),

    parse(raw) {
      let min = parseInteger(first(raw[minKey]))
      let max = parseInteger(first(raw[maxKey]))
      if (min === 0) min = null
      if (min !== null && max !== null && min > max) [min, max] = [max, min]
      return min === null && max === null ? null : { min, max }
    },

    serialize({ min, max }) {
      const entries: [string, string][] = []
      if (min !== null) entries.push([minKey, String(min)])
      if (max !== null) entries.push([maxKey, String(max)])
      return entries
    },

    // One chip for the whole range: removing it clears both bounds
    chips({ min, max }) {
      const range =
        min !== null && max !== null
          ? min === max
            ? format(min)
            : `${format(min)} – ${format(max)}`
          : min !== null
            ? `from ${format(min)}`
            : `up to ${format(max!)}`
      return [{ label: `${meta.label}: ${range}`, without: null }]
    },
  }
}

// boolean: ?hasWifi=1; anything else is off
function booleanFilter(
  info: SpecFilterInfo
): ListingFilter<SpecBooleanFilterValue> {
  const { field, meta } = info
  return {
    key: field,
    spec: info,
    facet: specFacet(info),

    parse(raw) {
      return first(raw[field]) === "1" ? true : null
    },

    serialize() {
      return [[field, "1"]]
    },

    chips() {
      return [{ label: meta.label, without: null }]
    },
  }
}

const filterByKind: Record<
  SpecFilterKind,
  (info: SpecFilterInfo) => ListingFilter<unknown>
> = {
  enum: choiceFilter,
  contains: choiceFilter,
  values: choiceFilter,
  range: rangeFilter,
  boolean: booleanFilter,
}

// The listing filter for one spec field with a filter kind
export function specFilter(
  category: BuilderCategorySlug,
  field: string,
  meta: FieldMeta & { filter: SpecFilterKind }
): ListingFilter<unknown> {
  const kind = meta.filter
  const text = kind === "values" && isTextField(category, field)
  return filterByKind[kind]({ field, meta, kind, text })
}
