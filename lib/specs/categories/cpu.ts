import { z } from "zod"

import {
  CPU_GENERATION_LABELS,
  CPU_GENERATION_SOCKET,
  cpuGeneration,
  socket,
  SOCKET_LABELS,
} from "../enums"
import { positiveInt, type FieldMetaMap } from "../helpers"

export const cpuSpecs = z
  .strictObject({
    socket: socket,
    generation: cpuGeneration,
    // Total cores; Intel hybrid CPUs count P + E cores
    cores: positiveInt(),
    threads: positiveInt(),
    baseClockMhz: positiveInt(),
    boostClockMhz: positiveInt(),
    // Worst-case power at full boost, for the PSU estimate: Intel Maximum
    // Turbo Power, AMD PPT. Not the rated TDP or base power.
    tdpW: positiveInt(),
    hasIntegratedGraphics: z.boolean(),
  })
  .check((ctx) => {
    const cpu = ctx.value
    if (cpu.threads < cpu.cores) {
      ctx.issues.push({
        code: "custom",
        message: `must be at least cores (${cpu.cores})`,
        input: cpu.threads,
        path: ["threads"],
      })
    }
    if (cpu.boostClockMhz < cpu.baseClockMhz) {
      ctx.issues.push({
        code: "custom",
        message: `must be at least baseClockMhz (${cpu.baseClockMhz})`,
        input: cpu.boostClockMhz,
        path: ["boostClockMhz"],
      })
    }
    const generationSocket = CPU_GENERATION_SOCKET[cpu.generation]
    if (generationSocket !== cpu.socket) {
      ctx.issues.push({
        code: "custom",
        message: `${cpu.generation} is an ${generationSocket} generation, but socket is ${cpu.socket}`,
        input: cpu.generation,
        path: ["generation"],
      })
    }
  })

export type CpuSpecs = z.infer<typeof cpuSpecs>

export const cpuFields = {
  socket: {
    label: "Socket",
    filterable: true,
    rules: ["socket-match", "cooler-socket", "bios-update"],
    options: SOCKET_LABELS,
  },
  generation: {
    label: "Generation",
    filterable: true,
    rules: ["bios-update"],
    options: CPU_GENERATION_LABELS,
  },
  cores: { label: "Cores", filterable: true },
  threads: { label: "Threads", filterable: false },
  baseClockMhz: { label: "Base clock", unit: "MHz", filterable: false },
  boostClockMhz: { label: "Boost clock", unit: "MHz", filterable: true },
  tdpW: {
    label: "Max power",
    unit: "W",
    filterable: true,
    rules: ["psu-wattage"],
  },
  hasIntegratedGraphics: {
    label: "Integrated graphics",
    filterable: true,
    rules: ["integrated-graphics"],
  },
} satisfies FieldMetaMap<typeof cpuSpecs>
