import type { Issue } from "@/lib/builder"

// Acknowledging warnings (docs/specs/026-add-build-to-cart, Rules › Warnings,
// D1). A warning's key is its rule plus its parts, as `slot/id` in the order
// the engine gives them. The message isn't part of it: its figures (a PSU
// load of 94% or 96%) move with small data changes, while a new rule or a
// different part is a real change. Pure: the browser sends the keys of the
// warnings the shopper saw, and the server compares them with its own.

export function warningKey(issue: Issue): string {
  return `${issue.rule}:${issue.parts
    .map((part) => `${part.slot}/${part.id}`)
    .join(",")}`
}

const isWarning = (issue: Issue) => issue.severity === "warning"

// The keys to send for the warnings the shopper confirmed. Errors have none:
// they can't be acknowledged.
export function acknowledgedKeys(issues: readonly Issue[]): string[] {
  return issues.filter(isWarning).map(warningKey)
}

// The warnings whose key the shopper hasn't acknowledged. Extra keys are
// ignored (a warning that went away needs nothing).
export function unacknowledged(
  issues: readonly Issue[],
  keys: readonly string[]
): Issue[] {
  const seen = new Set(keys)
  return issues.filter(
    (issue) => isWarning(issue) && !seen.has(warningKey(issue))
  )
}
