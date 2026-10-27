import { z } from "zod"

import { MEMORY_TYPE_LABELS, memoryType } from "../enums"
import { positiveInt, type FieldMetaMap } from "../helpers"

// One product is one retail kit. The builder multiplies by quantity:
// sticks = moduleCount × qty, total memory = capacityGb × qty.
export const memorySpecs = z.strictObject({
  memoryType: memoryType,
  // Total for the whole kit, e.g. 32 for 2×16 GB
  capacityGb: positiveInt(),
  moduleCount: positiveInt(),
  speedMts: positiveInt(),
  casLatency: positiveInt(),
})

export type MemorySpecs = z.infer<typeof memorySpecs>

export const memoryFields = {
  memoryType: {
    label: "Memory type",
    summary: {},
    filter: "enum",
    rules: ["memory-type"],
    options: MEMORY_TYPE_LABELS,
  },
  capacityGb: {
    label: "Capacity",
    summary: {},
    unit: "GB",
    filter: "values",
    rules: ["memory-capacity"],
  },
  moduleCount: {
    label: "Modules",
    filter: "values",
    rules: ["memory-slots"],
  },
  speedMts: { label: "Speed", unit: "MT/s", filter: "range", summary: {} },
  casLatency: { label: "CAS latency" },
} satisfies FieldMetaMap<typeof memorySpecs>
