import { biosUpdate } from "./bios-update"
import { coolerHeight } from "./cooler-height"
import { coolerSocket } from "./cooler-socket"
import { formFactor } from "./form-factor"
import { gpuLength } from "./gpu-length"
import { memoryType } from "./memory-type"
import { psuFormFactor } from "./psu-form-factor"
import { radiatorFit } from "./radiator-fit"
import type { Rule } from "./rule"
import { socketMatch } from "./socket-match"

// Every rule, in PRD table order: checkBuild reports issues in this order
// after errors-first. The count, capacity and power rules (#52) go in at
// their PRD rows.
export const RULES: readonly Rule[] = [
  socketMatch,
  memoryType,
  formFactor,
  gpuLength,
  coolerHeight,
  coolerSocket,
  radiatorFit,
  psuFormFactor,
  biosUpdate,
]
