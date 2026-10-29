import type { RuleId } from "@/lib/specs"

import type { Build, Slot } from "./types"

// Whether a product has anything in the build to be compared with
// (docs/specs/023-fits-your-build-hints, Rules › Comparable parts). Each rule
// lists the slots it needs filled to run, as alternatives: any one set of
// slots is enough. `integrated-graphics` reads the CPU alone, so it never
// counts: a CPU with no integrated graphics isn't "checked" against a build
// that holds nothing it touches. Typed by RuleId, so a new rule fails the
// type check until it has an entry here; comparable.test.ts also runs every
// seed part to catch an entry that drifts from the rule.
const RULE_SLOTS: Record<RuleId, readonly (readonly Slot[])[]> = {
  "socket-match": [["cpu", "motherboard"]],
  "memory-type": [["memory", "motherboard"]],
  "memory-slots": [["memory", "motherboard"]],
  "memory-capacity": [["memory", "motherboard"]],
  "form-factor": [["motherboard", "case"]],
  "gpu-length": [["gpu", "case"]],
  "cooler-height": [["cpu-cooler", "case"]],
  // The CPU's socket, or the board's when no CPU is picked (spec 018)
  "cooler-socket": [
    ["cpu-cooler", "cpu"],
    ["cpu-cooler", "motherboard"],
  ],
  "radiator-fit": [["cpu-cooler", "case"]],
  "psu-wattage": [
    ["psu", "cpu"],
    ["psu", "gpu"],
  ],
  "psu-form-factor": [["psu", "case"]],
  "m2-slots": [["storage", "motherboard"]],
  "integrated-graphics": [],
  "bios-update": [["cpu", "motherboard"]],
}

export const RULE_IDS = Object.keys(RULE_SLOTS) as RuleId[]

// True when a rule that reads `slot` has every other slot it needs filled in
// the build. The candidate's own slot counts as filled whatever it holds: the
// part there is replaced, so it isn't something to compare with.
export function hasComparableParts(build: Build, slot: Slot): boolean {
  const filled = (other: Slot) => (build[other]?.length ?? 0) > 0
  return Object.values(RULE_SLOTS).some((alternatives) =>
    alternatives.some(
      (slots) =>
        slots.includes(slot) &&
        slots.every((other) => other === slot || filled(other))
    )
  )
}
