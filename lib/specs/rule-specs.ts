import type { FieldMeta } from "./helpers"
import { builderCategories, type BuilderCategorySlug } from "./registry"

// The spec fields a compatibility rule reads (docs/specs/023-fits-your-build-
// hints, "What the server sends"): the fields whose FieldMeta has `rules`.
// The "Fits your build" hints send only these to the browser, to keep the
// HTML small. A rule that read any other field would break the hints, so
// rule-specs.test.ts runs every seed part both ways.
export function ruleSpecsOf(
  slot: BuilderCategorySlug,
  specs: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  const fields: Record<string, FieldMeta> = builderCategories[slot].fields
  return Object.fromEntries(
    Object.entries(specs).filter(
      ([key]) => (fields[key]?.rules?.length ?? 0) > 0
    )
  )
}
