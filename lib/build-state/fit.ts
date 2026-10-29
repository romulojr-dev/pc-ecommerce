import {
  type AnyBuildPart,
  type Build,
  checkCandidate,
  hasComparableParts,
  type Issue,
  type Slot,
} from "@/lib/builder"
import { isBuilderCategory, ruleSpecsOf, validateSpecs } from "@/lib/specs"

// The "Fits your build" hint without React (docs/specs/023-fits-your-build-
// hints): the server sends each builder product as a FitPart, and the browser
// asks `fitOf` how it sits in the saved build. Shared by the browser and the
// server, so it imports no server code.

// What the server sends per product: the id, its slot, the full name (rule
// messages quote it) and only the spec fields a rule reads
export type FitPart = {
  id: string
  slot: Slot
  name: string
  ruleSpecs: Record<string, unknown>
}

// The hint's state. `none` shows nothing: the build has nothing to compare
// the product with.
export type Fit =
  | { kind: "in-build" }
  | { kind: "none" }
  | { kind: "fits" }
  | { kind: "warnings"; issues: Issue[] }
  | { kind: "errors"; issues: Issue[] }

// A product as a FitPart, or null when it can't be one: outside the builder
// categories, or specs that don't validate. Every write validates specs (ADR
// 0001), so that is a bad manual edit; it is logged, and the product gets no
// hint.
export function fitPartOf(product: {
  id: string
  name: string
  category: string
  specs: unknown
}): FitPart | null {
  const { category } = product
  if (!isBuilderCategory(category)) return null
  const specs = validateSpecs(category, product.specs)
  if (!specs.success) {
    console.error(
      `Invalid specs for product ${product.id}:`,
      specs.error.issues
    )
    return null
  }
  return {
    id: product.id,
    slot: category,
    name: product.name,
    ruleSpecs: ruleSpecsOf(category, specs.data),
  }
}

// How the product sits in the build: already in it, nothing to compare, or
// `checkCandidate`'s verdict, the call the slot picker makes (ADR 0006), so
// the two always agree. Errors decide before warnings.
export function fitOf(build: Build, part: FitPart): Fit {
  const entries = build[part.slot] ?? []
  if (entries.some((entry) => entry.part.id === part.id)) {
    return { kind: "in-build" }
  }
  if (!hasComparableParts(build, part.slot)) return { kind: "none" }

  // The rules read only ruleSpecs fields, which rule-specs.test.ts proves
  // for every seed part, so the engine's part needs no more than this
  const candidate = {
    id: part.id,
    name: part.name,
    category: part.slot,
    specs: part.ruleSpecs,
  } as unknown as AnyBuildPart
  const issues = checkCandidate(build, part.slot, candidate as never)
  if (issues.some((issue) => issue.severity === "error")) {
    return { kind: "errors", issues }
  }
  return issues.length > 0 ? { kind: "warnings", issues } : { kind: "fits" }
}
