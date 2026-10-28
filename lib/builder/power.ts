import { assertValidBuild } from "./limits"
import { one } from "./rules/rule"
import type { Build } from "./types"

// The build's estimated power draw (docs/specs/019-count-capacity-power-rules,
// "Power"). All whole numbers, so 80% and 100% are exact.

// The PRD's ×1.3 headroom, in tenths
export const PSU_HEADROOM_TENTHS = 13

// Power for the parts other than the CPU and GPU. 0: their figures are
// already worst case and the headroom covers the rest; any more would turn
// spec 001's 517 W / 550 W warning into an error.
export const OTHER_PARTS_ALLOWANCE_W = 0

// PSU wattage warns above this share of the PSU's wattage
export const PSU_WARNING_PERCENT = 80

export type PowerEstimate = {
  watts: number
  // Null until a PSU is picked
  psuWatts: number | null
  // Rounded up, so it never shows 80% on a warning or 100% on an error
  loadPercent: number | null
}

// For a build already known to be valid (the PSU wattage rule)
export function powerOf(build: Build): PowerEstimate {
  const draw =
    (one(build, "cpu")?.specs.tdpW ?? 0) +
    (one(build, "gpu")?.specs.boardPowerW ?? 0) +
    OTHER_PARTS_ALLOWANCE_W
  // × 13 / 10, halves rounded up
  const watts = Math.floor((draw * PSU_HEADROOM_TENTHS + 5) / 10)
  const psu = one(build, "psu")
  if (!psu) return { watts, psuWatts: null, loadPercent: null }
  const psuWatts = psu.specs.wattageW
  // Multiply first: watts / psuWatts * 100 rounds twice (550 / 1000 → 56%)
  return { watts, psuWatts, loadPercent: Math.ceil((watts * 100) / psuWatts) }
}

// The figure the builder summary shows, with or without a PSU. Throws
// InvalidBuildError for a build that breaks the slot limits (a bug).
export function estimateWattage(build: Build): PowerEstimate {
  assertValidBuild(build)
  return powerOf(build)
}
