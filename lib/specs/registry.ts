import type { z } from "zod"

import { caseFields, caseSpecs } from "./categories/case"
import { cpuFields, cpuSpecs } from "./categories/cpu"
import { cpuCoolerFields, cpuCoolerSpecs } from "./categories/cpu-cooler"
import { gpuFields, gpuSpecs } from "./categories/gpu"
import { memoryFields, memorySpecs } from "./categories/memory"
import { motherboardFields, motherboardSpecs } from "./categories/motherboard"
import { psuFields, psuSpecs } from "./categories/psu"
import { storageFields, storageSpecs } from "./categories/storage"
import type { FieldMeta } from "./helpers"

type CategoryDefinition = {
  name: string
  // Builder step order (PRD PC Builder flow)
  sortOrder: number
  schema: z.ZodType
  fields: Record<string, FieldMeta>
}

// The builder categories, keyed by Category.slug. This is the link between a
// category row and its spec schema (ADR 0002); the seed creates the category
// rows from this object.
export const builderCategories = {
  cpu: { name: "CPU", sortOrder: 1, schema: cpuSpecs, fields: cpuFields },
  motherboard: {
    name: "Motherboard",
    sortOrder: 2,
    schema: motherboardSpecs,
    fields: motherboardFields,
  },
  memory: {
    name: "Memory",
    sortOrder: 3,
    schema: memorySpecs,
    fields: memoryFields,
  },
  storage: {
    name: "Storage",
    sortOrder: 4,
    schema: storageSpecs,
    fields: storageFields,
  },
  gpu: {
    name: "Graphics Card",
    sortOrder: 5,
    schema: gpuSpecs,
    fields: gpuFields,
  },
  case: { name: "Case", sortOrder: 6, schema: caseSpecs, fields: caseFields },
  psu: {
    name: "Power Supply",
    sortOrder: 7,
    schema: psuSpecs,
    fields: psuFields,
  },
  "cpu-cooler": {
    name: "CPU Cooler",
    sortOrder: 8,
    schema: cpuCoolerSpecs,
    fields: cpuCoolerFields,
  },
} satisfies Record<string, CategoryDefinition>

export type BuilderCategorySlug = keyof typeof builderCategories
