import { builderCategories } from "@/lib/specs"

import type { Build, Slot } from "./types"

// Every slot, in builder order (builderCategories is keyed in sortOrder)
export const SLOTS = Object.keys(builderCategories) as Slot[]

export type SlotLimit = {
  // Several entries (storage), or at most one
  multipleEntries: boolean
  // "one": quantity is always 1; "any": a whole number of at least 1
  quantity: "one" | "any"
}

// docs/specs/018-compatibility-rules, "Input shape". No upper limit on
// quantity: too many sticks or drives are the memory-slots and M.2-slots
// rules' job, not a shape error.
export const SLOT_LIMITS: Record<Slot, SlotLimit> = {
  cpu: { multipleEntries: false, quantity: "one" },
  motherboard: { multipleEntries: false, quantity: "one" },
  memory: { multipleEntries: false, quantity: "any" },
  storage: { multipleEntries: true, quantity: "any" },
  gpu: { multipleEntries: false, quantity: "one" },
  case: { multipleEntries: false, quantity: "one" },
  psu: { multipleEntries: false, quantity: "one" },
  "cpu-cooler": { multipleEntries: false, quantity: "one" },
}

export const isSlot = (key: string): key is Slot =>
  Object.hasOwn(SLOT_LIMITS, key)

// A build that breaks the slot limits. Builds from parseBuild and
// assembleBuild never do, so this is a bug in the calling code.
export class InvalidBuildError extends Error {
  readonly problems: readonly string[]

  constructor(problems: readonly string[]) {
    super(
      [`Invalid build: ${problems.length} problem(s)`, ...problems].join("\n")
    )
    this.name = "InvalidBuildError"
    this.problems = problems
  }
}

// Every way the build breaks the slot limits, in slot order; empty when it
// is valid
export function validateBuild(build: Build): string[] {
  const problems = Object.keys(build)
    .filter((key) => !isSlot(key))
    .map((key) => `${key}: not a builder slot`)
  for (const slot of SLOTS) {
    const entries = build[slot] ?? []
    const limit = SLOT_LIMITS[slot]
    if (!limit.multipleEntries && entries.length > 1) {
      problems.push(`${slot}: holds one entry, got ${entries.length}`)
    }
    const seen = new Set<string>()
    for (const { part, quantity } of entries) {
      if (!Number.isInteger(quantity) || quantity < 1) {
        problems.push(
          `${slot}: quantity must be a whole number of at least 1, got ${quantity}`
        )
      } else if (limit.quantity === "one" && quantity !== 1) {
        problems.push(`${slot}: quantity must be 1, got ${quantity}`)
      }
      if (part.category !== slot) {
        problems.push(
          `${slot}: part ${part.id} is a ${part.category}, not a ${slot}`
        )
      }
      if (limit.multipleEntries && seen.has(part.id)) {
        problems.push(
          `${slot}: ${part.id} is listed more than once; use quantity`
        )
      }
      seen.add(part.id)
    }
  }
  return problems
}

export function assertValidBuild(build: Build): void {
  const problems = validateBuild(build)
  if (problems.length > 0) throw new InvalidBuildError(problems)
}
