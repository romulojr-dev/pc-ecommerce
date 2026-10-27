import { formatSpecValue } from "./format"
import type { FieldMeta } from "./helpers"
import { builderCategories } from "./registry"

// The product card's spec summary line (docs/specs/016-home-page), e.g.
// "AM5 · 6 cores · 5.1 GHz boost": the fields marked `summary` in metadata
// order. A true boolean shows its label and a false one is left out, as is a
// missing value. Null when nothing is left, or for a category without specs.
export function specSummary(
  categorySlug: string,
  specs: unknown
): string | null {
  if (!Object.hasOwn(builderCategories, categorySlug)) return null
  if (typeof specs !== "object" || specs === null) return null
  const fields: Record<string, FieldMeta> =
    builderCategories[categorySlug as keyof typeof builderCategories].fields
  return summarize(fields, specs as Record<string, unknown>)
}

// The summary of `values` under the given metadata; exported for tests
export function summarize(
  fields: Record<string, FieldMeta>,
  values: Record<string, unknown>
): string | null {
  const parts: string[] = []
  for (const [key, meta] of Object.entries(fields)) {
    if (!meta.summary) continue
    const value = values[key]
    if (value === undefined || value === null || value === false) continue
    if (value === true) {
      parts.push(meta.label)
      continue
    }
    const text = formatSpecValue(meta, value)
    if (text === null) continue
    const { suffix } = meta.summary
    parts.push(suffix ? `${text} ${suffix}` : text)
  }
  return parts.length > 0 ? parts.join(" · ") : null
}
