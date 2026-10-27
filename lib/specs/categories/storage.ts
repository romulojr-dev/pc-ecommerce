import { z } from "zod"

import {
  STORAGE_FORM_FACTOR_LABELS,
  STORAGE_INTERFACE_LABELS,
  storageFormFactor,
  storageInterface,
} from "../enums"
import { positiveInt, type FieldMetaMap } from "../helpers"

export const storageSpecs = z
  .strictObject({
    interface: storageInterface,
    // Every M2_* drive takes an M.2 slot, NVMe or SATA (M.2 slots rule)
    formFactor: storageFormFactor,
    // Decimal GB: 1 TB = 1000
    capacityGb: positiveInt(),
  })
  .check((ctx) => {
    const drive = ctx.value
    // With two interfaces, "NVMe must be M.2" and "2.5"/3.5" drives must be
    // SATA" are the same check. M.2 SATA is allowed.
    if (drive.interface === "NVME" && !drive.formFactor.startsWith("M2_")) {
      ctx.issues.push({
        code: "custom",
        message: "NVMe drives must be M.2",
        input: drive.formFactor,
        path: ["formFactor"],
      })
    }
  })

export type StorageSpecs = z.infer<typeof storageSpecs>

export const storageFields = {
  capacityGb: {
    label: "Capacity",
    unit: "GB",
    largeUnit: { unit: "TB", per: 1000 },
    filter: "values",
  },
  formFactor: {
    label: "Form factor",
    filter: "enum",
    rules: ["m2-slots"],
    options: STORAGE_FORM_FACTOR_LABELS,
  },
  interface: {
    label: "Interface",
    filter: "enum",
    options: STORAGE_INTERFACE_LABELS,
  },
} satisfies FieldMetaMap<typeof storageSpecs>
