import { checkBuild } from "./check"
import { InvalidBuildError } from "./limits"
import type {
  Build,
  BuildEntry,
  BuildPart,
  Issue,
  Severity,
  Slot,
} from "./types"

// The slot picker's questions (docs/specs/018-compatibility-rules,
// "checkCandidate and applyCandidate")

export type CandidateOptions = {
  // Storage only: the id of the drive the candidate replaces. Without it, a
  // drive is added.
  replace?: string
}

function changedDrives(
  drives: readonly BuildEntry<"storage">[],
  part: BuildPart<"storage">,
  replace: string | undefined
): BuildEntry<"storage">[] {
  const existing = drives.findIndex((entry) => entry.part.id === part.id)
  if (replace === undefined) {
    if (existing === -1) return [...drives, { part, quantity: 1 }]
    return drives.map((entry, index) =>
      index === existing ? { ...entry, quantity: entry.quantity + 1 } : entry
    )
  }
  const replaced = drives.findIndex((entry) => entry.part.id === replace)
  if (replaced === -1) {
    throw new InvalidBuildError([
      `storage: cannot replace ${replace}, it is not in the build`,
    ])
  }
  if (replace === part.id) return [...drives]
  const { quantity } = drives[replaced]
  // Already listed elsewhere: the two entries merge into that one
  if (existing !== -1) {
    return drives
      .map((entry, index) =>
        index === existing
          ? { ...entry, quantity: entry.quantity + quantity }
          : entry
      )
      .filter((_, index) => index !== replaced)
  }
  return drives.map((entry, index) =>
    index === replaced ? { part, quantity } : entry
  )
}

// A copy of the build with the candidate in place. One-part slots and memory
// replace their part (memory keeps its quantity); storage adds the drive, or
// replaces the one named in `replace`, keeping its position and quantity.
export function applyCandidate<S extends Slot>(
  build: Build,
  slot: S,
  part: BuildPart<S>,
  options: CandidateOptions = {}
): Build {
  if (part.category !== slot) {
    throw new InvalidBuildError([
      `${slot}: part ${part.id} is a ${part.category}, not a ${slot}`,
    ])
  }
  if (slot === "storage") {
    const drives = changedDrives(
      build.storage ?? [],
      part as BuildPart<"storage">,
      options.replace
    )
    return { ...build, storage: drives }
  }
  const quantity = slot === "memory" ? (build.memory?.[0]?.quantity ?? 1) : 1
  return { ...build, [slot]: [{ part, quantity }] }
}

// The build the candidate is judged against: its slot empty, or for
// storage the build without the candidate's change (adding: the build as
// given; replacing: without the replaced drive)
function baseline(build: Build, slot: Slot, replace: string | undefined) {
  if (slot !== "storage") return { ...build, [slot]: [] }
  if (replace === undefined) return build
  const drives = (build.storage ?? []).filter(
    (entry) => entry.part.id !== replace
  )
  return { ...build, storage: drives }
}

const RANK: Record<Severity | "none", number> = {
  none: 0,
  warning: 1,
  error: 2,
}

// The issues the candidate makes new or more severe than in the baseline
// (docs/specs/019-count-capacity-power-rules, "checkCandidate"). A problem
// the build already has, like a PSU the GPU alone overloads, isn't blamed on
// every candidate; the picker shows it once (#54).
export function checkCandidate<S extends Slot>(
  build: Build,
  slot: S,
  part: BuildPart<S>,
  options: CandidateOptions = {}
): Issue[] {
  const after = checkBuild(applyCandidate(build, slot, part, options))
  const before = new Map(
    checkBuild(baseline(build, slot, options.replace)).map((issue) => [
      issue.rule,
      issue.severity,
    ])
  )
  return after.filter(
    (issue) => RANK[issue.severity] > RANK[before.get(issue.rule) ?? "none"]
  )
}
