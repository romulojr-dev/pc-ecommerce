import {
  builderCategories,
  formatSpecValue,
  withUnit,
  type FieldMeta,
} from "@/lib/specs"

import type { Slot } from "./types"

// Spec values in rule messages, formatted like the spec table
// (docs/specs/018-compatibility-rules, "Messages and copy")

function fieldMeta(slot: Slot, field: string): FieldMeta {
  const fields: Record<string, FieldMeta> = builderCategories[slot].fields
  return fields[field]
}

// One value with its label or unit: "AM5", "Micro-ATX", "358 mm"
export function specValue(slot: Slot, field: string, value: unknown): string {
  return formatSpecValue(fieldMeta(slot, field), value) ?? String(value)
}

// "A", "A or B", "A, B or C"
export function joinList(items: readonly string[], conjunction: "or" | "and") {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1)}`
}

// A list field's values in enum order (numbers ascending), joined, with the
// unit once at the end: "Micro-ATX or Mini-ITX", "120 or 280 mm"
export function specList(
  slot: Slot,
  field: string,
  values: readonly (string | number)[],
  conjunction: "or" | "and"
): string {
  const meta = fieldMeta(slot, field)
  const order = meta.options ? Object.keys(meta.options) : null
  const rank = (value: string | number) =>
    order ? order.indexOf(String(value)) : Number(value)
  const items = [...values]
    .sort((a, b) => rank(a) - rank(b))
    .map(
      (value) =>
        formatSpecValue(
          { ...meta, unit: undefined, largeUnit: undefined },
          value
        ) ?? String(value)
    )
  const text = joinList(items, conjunction)
  return meta.unit ? withUnit(text, meta.unit) : text
}

// A count with its noun: "1 memory slot", "2 memory slots"
export function plural(
  count: number,
  singular: string,
  plural = `${singular}s`
) {
  return `${count} ${count === 1 ? singular : plural}`
}
