import { z } from "zod"

import {
  EFFICIENCY_RATING_LABELS,
  efficiencyRating,
  MODULARITY_LABELS,
  modularity,
  PSU_FORM_FACTOR_LABELS,
  psuFormFactor,
} from "../enums"
import { positiveInt, type FieldMetaMap } from "../helpers"

export const psuSpecs = z.strictObject({
  formFactor: psuFormFactor,
  wattageW: positiveInt(),
  efficiencyRating: efficiencyRating,
  modularity: modularity,
})

export type PsuSpecs = z.infer<typeof psuSpecs>

export const psuFields = {
  wattageW: {
    label: "Wattage",
    unit: "W",
    filter: "range",
    rules: ["psu-wattage"],
  },
  efficiencyRating: {
    label: "Efficiency",
    filter: "enum",
    options: EFFICIENCY_RATING_LABELS,
  },
  formFactor: {
    label: "Form factor",
    filter: "enum",
    rules: ["psu-form-factor"],
    options: PSU_FORM_FACTOR_LABELS,
  },
  modularity: {
    label: "Modularity",
    filter: "enum",
    options: MODULARITY_LABELS,
  },
} satisfies FieldMetaMap<typeof psuSpecs>
