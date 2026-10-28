import { biosUpdate } from "./bios-update"
import { coolerHeight } from "./cooler-height"
import { coolerSocket } from "./cooler-socket"
import { formFactor } from "./form-factor"
import { gpuLength } from "./gpu-length"
import { integratedGraphics } from "./integrated-graphics"
import { m2Slots } from "./m2-slots"
import { memoryCapacity } from "./memory-capacity"
import { memorySlots } from "./memory-slots"
import { memoryType } from "./memory-type"
import { psuFormFactor } from "./psu-form-factor"
import { psuWattage } from "./psu-wattage"
import { radiatorFit } from "./radiator-fit"
import type { Rule } from "./rule"
import { socketMatch } from "./socket-match"

// Every rule, in PRD table order: checkBuild reports issues in this order
// after errors-first
export const RULES: readonly Rule[] = [
  socketMatch,
  memoryType,
  memorySlots,
  memoryCapacity,
  formFactor,
  gpuLength,
  coolerHeight,
  coolerSocket,
  radiatorFit,
  psuWattage,
  psuFormFactor,
  m2Slots,
  integratedGraphics,
  biosUpdate,
]
