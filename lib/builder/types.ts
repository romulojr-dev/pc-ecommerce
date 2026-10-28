import type { BuilderCategorySlug, RuleId, Specs } from "@/lib/specs"

// A builder slot is one builder category (docs/specs/018-compatibility-rules)
export type Slot = BuilderCategorySlug

// A product as the rules see it. Specs have passed validateSpecs (every
// write does, ADR 0001), so the engine trusts them.
export type BuildPart<S extends Slot = Slot> = {
  id: string
  name: string
  category: S
  specs: Specs<S>
}

// Any one part, with its category and specs tied together
export type AnyBuildPart = { [S in Slot]: BuildPart<S> }[Slot]

export type BuildEntry<S extends Slot = Slot> = {
  part: BuildPart<S>
  quantity: number
}

// Each slot's entries; a missing slot and an empty list both mean "nothing
// picked". Each entry maps 1:1 to a BuildItem row. Limits: SLOT_LIMITS.
export type Build = { [S in Slot]?: BuildEntry<S>[] }

export type Severity = "error" | "warning"

export type IssuePart = { slot: Slot; id: string }

// One failed rule. `parts` are in the PRD table's "Parts checked" order.
export type Issue = {
  rule: RuleId
  severity: Severity
  parts: IssuePart[]
  message: string
}

export type BuildStatus = "ok" | "warnings" | "errors"
