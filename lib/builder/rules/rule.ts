import type { RuleId } from "@/lib/specs"

import type {
  AnyBuildPart,
  Build,
  BuildEntry,
  BuildPart,
  Issue,
  Severity,
  Slot,
} from "../types"

// What a failed rule reports: the parts involved, in the PRD table's "Parts
// checked" order, and the message. `severity` overrides the rule's for a
// rule with two levels (PSU wattage).
export type Finding = {
  parts: AnyBuildPart[]
  message: string
  severity?: Severity
}

// One row of the PRD rules table. `check` returns null when a part it reads
// isn't picked, or when the parts fit. `severity` is the rule's worst.
export type Rule = {
  id: RuleId
  severity: Severity
  check(build: Build): Finding | null
}

// The part in a one-part slot (or memory's kit), if picked
export function one<S extends Slot>(
  build: Build,
  slot: S
): BuildPart<S> | undefined {
  return (build[slot] as BuildEntry<S>[] | undefined)?.[0]?.part
}

export function checkRule(rule: Rule, build: Build): Issue | null {
  const finding = rule.check(build)
  if (!finding) return null
  return {
    rule: rule.id,
    severity: finding.severity ?? rule.severity,
    parts: finding.parts.map((part) => ({ slot: part.category, id: part.id })),
    message: finding.message,
  }
}
