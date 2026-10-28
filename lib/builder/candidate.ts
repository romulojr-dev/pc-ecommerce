import { checkBuild } from "./check"
import { InvalidBuildError } from "./limits"
import type { Build, BuildEntry, BuildPart, Issue, Slot } from "./types"

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

// The issues the candidate would cause: those in the changed build that
// involve it. Conflicts between other parts, and those of the part it
// replaces, are left out.
export function checkCandidate<S extends Slot>(
  build: Build,
  slot: S,
  part: BuildPart<S>,
  options: CandidateOptions = {}
): Issue[] {
  return checkBuild(applyCandidate(build, slot, part, options)).filter(
    (issue) =>
      issue.parts.some((ref) => ref.slot === slot && ref.id === part.id)
  )
}
