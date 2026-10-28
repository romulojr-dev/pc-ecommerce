import { assertValidBuild } from "./limits"
import { RULES } from "./rules"
import { checkRule } from "./rules/rule"
import type { Build, BuildStatus, Issue } from "./types"

// Every issue in the build: errors first, then PRD table order. A rule runs
// only when all the parts it reads are picked. Throws InvalidBuildError for
// a build that breaks the slot limits (a bug: untrusted builds go through
// parseBuild and assembleBuild first).
export function checkBuild(build: Build): Issue[] {
  assertValidBuild(build)
  const issues = RULES.map((rule) => checkRule(rule, build)).filter(
    (issue) => issue !== null
  )
  return [
    ...issues.filter((issue) => issue.severity === "error"),
    ...issues.filter((issue) => issue.severity === "warning"),
  ]
}

// The worst severity among the issues; the summary shows OK / Warnings /
// Errors (#53)
export function buildStatus(issues: readonly Issue[]): BuildStatus {
  if (issues.some((issue) => issue.severity === "error")) return "errors"
  if (issues.length > 0) return "warnings"
  return "ok"
}
