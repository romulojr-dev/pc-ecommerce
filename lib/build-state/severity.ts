import type { Issue, Severity, Slot } from "@/lib/builder"

// The most severe issue that names this part, if any (docs/specs/020-builder-
// page, Behavior 12). Used by the builder's rows and the shared page's.
export function worstSeverity(
  issues: readonly Issue[],
  slot: Slot,
  id: string
): Severity | null {
  const named = issues.filter((issue) =>
    issue.parts.some((part) => part.slot === slot && part.id === id)
  )
  if (named.some((issue) => issue.severity === "error")) return "error"
  return named.length > 0 ? "warning" : null
}
