import { z } from "zod"

import {
  MOTHERBOARD_FORM_FACTOR_LABELS,
  motherboardFormFactor,
  PSU_FORM_FACTOR_LABELS,
  psuFormFactor,
  radiatorSizeMm,
} from "../enums"
import { positiveInt, uniqueList, type FieldMetaMap } from "../helpers"

export const caseSpecs = z.strictObject({
  motherboardFormFactors: uniqueList(motherboardFormFactor, { nonEmpty: true }),
  // Limits are rounded down from the manufacturer's figure (180.5 -> 180).
  // GPU length is the maximum with no front radiator fitted.
  maxGpuLengthMm: positiveInt(),
  maxCoolerHeightMm: positiveInt(),
  // Every size that fits in any mounting position. Required, but may be
  // empty: [] means the case takes no AIO.
  radiatorSizesMm: uniqueList(radiatorSizeMm),
  psuFormFactors: uniqueList(psuFormFactor, { nonEmpty: true }),
})

export type CaseSpecs = z.infer<typeof caseSpecs>

export const caseFields = {
  motherboardFormFactors: {
    label: "Motherboard support",
    filter: "contains",
    rules: ["form-factor"],
    options: MOTHERBOARD_FORM_FACTOR_LABELS,
  },
  maxGpuLengthMm: {
    label: "Max GPU length",
    summary: { suffix: "GPU" },
    unit: "mm",
    filter: "range",
    rules: ["gpu-length"],
  },
  maxCoolerHeightMm: {
    label: "Max CPU cooler height",
    summary: { suffix: "cooler" },
    unit: "mm",
    filter: "range",
    rules: ["cooler-height"],
  },
  radiatorSizesMm: {
    label: "Radiator support",
    unit: "mm",
    rules: ["radiator-fit"],
  },
  psuFormFactors: {
    label: "PSU support",
    rules: ["psu-form-factor"],
    options: PSU_FORM_FACTOR_LABELS,
  },
} satisfies FieldMetaMap<typeof caseSpecs>
