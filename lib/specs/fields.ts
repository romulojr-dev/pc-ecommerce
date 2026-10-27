import { z } from "zod"

import { builderCategories, type BuilderCategorySlug } from "./registry"

// Each field's schemas by key, one per branch of the cooler union that has
// it. Optional wrappers are unwrapped; z.never placeholders (a field of the
// other cooler type) are skipped.
export function fieldSchemas(schema: z.ZodType): Map<string, z.ZodType[]> {
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

// True for free-text fields such as a GPU's chipset. A `values` filter on one
// compares text; on any other field it compares numbers
// (docs/specs/013-spec-filters).
export function isTextField(
  category: BuilderCategorySlug,
  field: string
): boolean {
  const schemas = fieldSchemas(builderCategories[category].schema).get(field)
  return schemas?.every((schema) => schema instanceof z.ZodString) ?? false
}
