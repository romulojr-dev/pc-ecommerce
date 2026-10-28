import { specValue } from "../format"
import { powerOf, PSU_WARNING_PERCENT } from "../power"
import { one, type Rule } from "./rule"

// The estimate against the PSU (docs/specs/019-count-capacity-power-rules,
// "Power"): an error over 100%, a warning above 80%. Compares the rounded
// watts the shopper sees, in whole numbers.
export const psuWattage: Rule = {
  id: "psu-wattage",
  severity: "error",
  check(build) {
    const cpu = one(build, "cpu")
    const gpu = one(build, "gpu")
    const psu = one(build, "psu")
    if (!psu || (!cpu && !gpu)) return null
    const { watts, loadPercent } = powerOf(build)
    const psuWatts = psu.specs.wattageW
    const over = watts > psuWatts
    if (!over && watts * 100 <= psuWatts * PSU_WARNING_PERCENT) return null
    const loads =
      cpu && gpu
        ? `The ${cpu.name} and the ${gpu.name} need`
        : `The ${(cpu ?? gpu)!.name} needs`
    const estimate = `${loads} an estimated ${specValue("psu", "wattageW", watts)}`
    const supply = `the ${specValue("psu", "wattageW", psuWatts)} the ${psu.name} supplies`
    return {
      parts: [cpu, gpu, psu].filter((part) => part !== undefined),
      severity: over ? "error" : "warning",
      message: over
        ? `${estimate}, more than ${supply}.`
        : `${estimate}, ${loadPercent}% of ${supply}, close to its limit.`,
    }
  },
}
