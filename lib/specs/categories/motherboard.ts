import { z } from "zod"

import {
  CPU_GENERATION_LABELS,
  CPU_GENERATION_SOCKET,
  cpuGeneration,
  MEMORY_TYPE_LABELS,
  memoryType,
  MOTHERBOARD_FORM_FACTOR_LABELS,
  motherboardFormFactor,
  socket,
  SOCKET_LABELS,
} from "../enums"
import {
  nonNegativeInt,
  positiveInt,
  uniqueList,
  type FieldMetaMap,
} from "../helpers"

export const motherboardSpecs = z
  .strictObject({
    socket: socket,
    // e.g. "B650", "B760"
    chipset: z.string().trim().min(1, "must not be empty"),
    // CPU generations the board's launch BIOS supports. A CPU on the right
    // socket but not in this list may need a BIOS update (warning only).
    nativeCpuGenerations: uniqueList(cpuGeneration, { nonEmpty: true }),
    formFactor: motherboardFormFactor,
    memoryType: memoryType,
    memorySlots: positiveInt(),
    maxMemoryGb: positiveInt(),
    m2Slots: nonNegativeInt(),
    hasWifi: z.boolean(),
  })
  .check((ctx) => {
    const board = ctx.value
    board.nativeCpuGenerations.forEach((generation, index) => {
      const generationSocket = CPU_GENERATION_SOCKET[generation]
      if (generationSocket !== board.socket) {
        ctx.issues.push({
          code: "custom",
          message: `${generation} is an ${generationSocket} generation, but socket is ${board.socket}`,
          input: generation,
          path: ["nativeCpuGenerations", index],
        })
      }
    })
  })

export type MotherboardSpecs = z.infer<typeof motherboardSpecs>

export const motherboardFields = {
  socket: {
    label: "Socket",
    summary: {},
    group: "Processor",
    filter: "enum",
    rules: ["socket-match", "bios-update"],
    options: SOCKET_LABELS,
  },
  chipset: { label: "Chipset", group: "Processor", filter: "values" },
  nativeCpuGenerations: {
    label: "Works without BIOS update",
    group: "Processor",
    rules: ["bios-update"],
    options: CPU_GENERATION_LABELS,
  },
  memoryType: {
    label: "Memory type",
    summary: {},
    group: "Memory",
    filter: "enum",
    rules: ["memory-type"],
    options: MEMORY_TYPE_LABELS,
  },
  memorySlots: {
    label: "Memory slots",
    group: "Memory",
    rules: ["memory-slots"],
  },
  maxMemoryGb: {
    label: "Max memory",
    unit: "GB",
    group: "Memory",
    rules: ["memory-capacity"],
  },
  formFactor: {
    label: "Form factor",
    summary: {},
    group: "Size and connectivity",
    filter: "enum",
    rules: ["form-factor"],
    options: MOTHERBOARD_FORM_FACTOR_LABELS,
  },
  m2Slots: {
    label: "M.2 slots",
    group: "Size and connectivity",
    filter: "values",
    rules: ["m2-slots"],
  },
  hasWifi: {
    label: "Wi-Fi",
    group: "Size and connectivity",
    filter: "boolean",
  },
} satisfies FieldMetaMap<typeof motherboardSpecs>
