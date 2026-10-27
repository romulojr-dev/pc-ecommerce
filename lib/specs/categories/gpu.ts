import { z } from "zod"

import { GPU_CHIPSET_BRAND_LABELS, gpuChipsetBrand } from "../enums"
import { positiveInt, type FieldMetaMap } from "../helpers"

export const gpuSpecs = z.strictObject({
  chipsetBrand: gpuChipsetBrand,
  // e.g. "GeForce RTX 5070"
  chipset: z.string().trim().min(1, "must not be empty"),
  vramGb: positiveInt(),
  // Rounded up from the manufacturer's figure, e.g. 227.2 mm -> 228
  lengthMm: positiveInt(),
  // Total board power (TBP / TGP)
  boardPowerW: positiveInt(),
})

export type GpuSpecs = z.infer<typeof gpuSpecs>

export const gpuFields = {
  chipsetBrand: {
    label: "Chipset brand",
    filter: "enum",
    options: GPU_CHIPSET_BRAND_LABELS,
  },
  chipset: { label: "Chipset", filter: "values" },
  vramGb: {
    label: "VRAM",
    unit: "GB",
    filter: "range",
    summary: { suffix: "VRAM" },
  },
  lengthMm: {
    label: "Length",
    unit: "mm",
    filter: "range",
    rules: ["gpu-length"],
  },
  boardPowerW: {
    label: "Board power",
    summary: {},
    unit: "W",
    rules: ["psu-wattage"],
  },
} satisfies FieldMetaMap<typeof gpuSpecs>
