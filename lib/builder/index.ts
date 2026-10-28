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
export {
  assembleBuild,
  buildItemSchema,
  buildItemsSchema,
  parseBuild,
  toBuildItems,
  type BuildChange,
  type BuildChangeKind,
  type BuildItem,
} from "./parse"
export { buildStatus, checkBuild } from "./check"
export {
  estimateWattage,
  OTHER_PARTS_ALLOWANCE_W,
  PSU_HEADROOM_TENTHS,
  PSU_WARNING_PERCENT,
  type PowerEstimate,
} from "./power"
export {
  applyCandidate,
  checkCandidate,
  type CandidateOptions,
} from "./candidate"
