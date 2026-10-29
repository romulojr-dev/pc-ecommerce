import type { z } from "zod"

import { builderCategories, type BuilderCategorySlug } from "./registry"

// Public API for spec schemas. Shared by the seed, the builder rules engine
// (browser and server), catalog filters and admin forms, so nothing in
// lib/specs may import server-only code.

export { builderCategories, type BuilderCategorySlug }
export * from "./enums"
export type { FieldMeta, RuleId, SpecFilterKind, SpecGroup } from "./helpers"
export { fieldSchemas, isTextField } from "./fields"
export {
  formatSpecValue,
  withUnit,
  getSpecRows,
  type SpecRow,
  type SpecRowGroup,
} from "./format"
export { specSummary } from "./summary"
export { ruleSpecsOf } from "./rule-specs"
export type { CaseSpecs } from "./categories/case"
export type { CpuSpecs } from "./categories/cpu"
export type { CpuCoolerSpecs } from "./categories/cpu-cooler"
export type { GpuSpecs } from "./categories/gpu"
export type { MemorySpecs } from "./categories/memory"
export type { MotherboardSpecs } from "./categories/motherboard"
export type { PsuSpecs } from "./categories/psu"
export type { StorageSpecs } from "./categories/storage"

// Parsed specs for a category, e.g. Specs<"cpu">["socket"] is "AM4" | "AM5" | …
export type Specs<C extends BuilderCategorySlug> = z.infer<
  (typeof builderCategories)[C]["schema"]
>

// False for categories without a spec schema (monitors, peripherals, …)
export function isBuilderCategory(slug: string): slug is BuilderCategorySlug {
  return Object.hasOwn(builderCategories, slug)
}

// Checks a product's specs against its category schema. Every write of
// Product.specs goes through this (ADR 0001).
export function validateSpecs<C extends BuilderCategorySlug>(
  category: C,
  input: unknown
): z.ZodSafeParseResult<Specs<C>> {
  const schema: z.ZodType = builderCategories[category].schema
  // TypeScript can't tie a generic C to its own schema, so the result is
  // narrowed here; the schema parsing is the same one Specs<C> is built from
  return schema.safeParse(input) as z.ZodSafeParseResult<Specs<C>>
}
