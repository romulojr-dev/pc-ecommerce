// The compatibility rules engine (docs/specs/018-compatibility-rules). Pure
// TypeScript shared by the browser (instant feedback) and the server (the
// checkout re-check); the eslint purity rule keeps it that way.

export type { RuleId } from "@/lib/specs"
export type {
  AnyBuildPart,
  Build,
  BuildEntry,
  BuildPart,
  BuildStatus,
  Issue,
  IssuePart,
  Severity,
  Slot,
} from "./types"
export {
  InvalidBuildError,
  SLOT_LIMITS,
  SLOTS,
  validateBuild,
  type SlotLimit,
} from "./limits"
