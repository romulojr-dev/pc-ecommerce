import { z } from "zod"

import {
  COOLER_TYPE_LABELS,
  radiatorSizeMm,
  socket,
  SOCKET_LABELS,
} from "../enums"
import { positiveInt, uniqueList, type FieldMetaMap } from "../helpers"

// A field that belongs to the other cooler type. Declaring it (instead of
// leaving it to strictObject) gives a clearer message than "unrecognized key".
const notAllowedFor = (type: "AIR" | "AIO") =>
  z.never({ error: `not allowed when type is "${type}"` }).optional()

const supportedSockets = uniqueList(socket, { nonEmpty: true })

const airCooler = z.strictObject({
  type: z.literal("AIR"),
  supportedSockets,
  // Rounded up from the manufacturer's figure
  heightMm: positiveInt(),
  radiatorSizeMm: notAllowedFor("AIR"),
})

const aioCooler = z.strictObject({
  type: z.literal("AIO"),
  supportedSockets,
  radiatorSizeMm: radiatorSizeMm,
  // The radiator, not the pump block, decides whether an AIO fits
  heightMm: notAllowedFor("AIO"),
})

// `type` picks the shape: the cooler height rule applies to AIR, radiator
// fit to AIO
export const cpuCoolerSpecs = z.discriminatedUnion("type", [
  airCooler,
  aioCooler,
])

export type CpuCoolerSpecs = z.infer<typeof cpuCoolerSpecs>

export const cpuCoolerFields = {
  type: {
    label: "Type",
    filterable: true,
    rules: ["cooler-height", "radiator-fit"],
    options: COOLER_TYPE_LABELS,
  },
  radiatorSizeMm: {
    label: "Radiator size",
    unit: "mm",
    filterable: true,
    rules: ["radiator-fit"],
  },
  supportedSockets: {
    label: "Socket support",
    filterable: true,
    rules: ["cooler-socket"],
    options: SOCKET_LABELS,
  },
  heightMm: {
    label: "Height",
    unit: "mm",
    filterable: false,
    rules: ["cooler-height"],
  },
} satisfies FieldMetaMap<typeof cpuCoolerSpecs>
