import type { FieldMeta, SpecGroup } from "./helpers"
import type { Specs } from "./index"
import { builderCategories, type BuilderCategorySlug } from "./registry"

// Spec values as shoppers read them (docs/specs/009-spec-table, "Value
// formatting"). Used by the spec table and, from Sprint 3, filter labels.

const number = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 })

// A non-breaking space, so "228 mm" never wraps between number and unit
export const withUnit = (value: string, unit: string) => `${value} ${unit}`

// One value without its unit: true -> "Yes", "MICRO_ATX" -> "Micro-ATX"
function formatItem(meta: FieldMeta, value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "number") return number.format(value)
  const text = String(value)
  return meta.options?.[text] ?? text
}

// 2000 GB -> "2 TB", 1000 W -> "1,000 W", [120, 240] mm -> "120, 240 mm",
// [] -> "None". Null for a missing value, so its row is left out.
export function formatSpecValue(
  meta: FieldMeta,
  value: unknown
): string | null {
  if (value === undefined) return null
  if (Array.isArray(value)) {
    if (value.length === 0) return "None"
    const items = value.map((item) => formatItem(meta, item)).join(", ")
    return meta.unit ? withUnit(items, meta.unit) : items
  }
  if (typeof value === "number" && meta.unit) {
    const large = meta.largeUnit
    return large && value >= large.per
      ? withUnit(number.format(value / large.per), large.unit)
      : withUnit(number.format(value), meta.unit)
  }
  return formatItem(meta, value)
}

export type SpecRow = { key: string; label: string; value: string }
// `group` is undefined for categories without groups
export type SpecRowGroup = { group?: SpecGroup; rows: SpecRow[] }

// A product's specs as table rows in display order (the field map's order),
// split where the group changes. Fields without a value are left out.
export function getSpecRows<C extends BuilderCategorySlug>(
  category: C,
  specs: Specs<C>
): SpecRowGroup[] {
  const fields: Record<string, FieldMeta> = builderCategories[category].fields
  const values = specs as Record<string, unknown>
  const groups: SpecRowGroup[] = []
  for (const [key, meta] of Object.entries(fields)) {
    const value = formatSpecValue(meta, values[key])
    if (value === null) continue
    let current = groups.at(-1)
    if (!current || current.group !== meta.group) {
      current = { group: meta.group, rows: [] }
      groups.push(current)
    }
    current.rows.push({ key, label: meta.label, value })
  }
  return groups
}
