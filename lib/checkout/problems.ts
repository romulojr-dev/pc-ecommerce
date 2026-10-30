import type { Issue } from "@/lib/builder"
import type { ProductFlag } from "@/lib/cart/flags"
import type { CartView } from "@/lib/cart/types"

// What stops a cart from being ordered, apart from the address
// (docs/specs/029-checkout-steps, Behavior 20, §4 Review). Pure: step 1 and
// the review both read the same list, from the cart view the server built.

export type ReviewProblem =
  // A single line whose product can't be bought as it is
  | { kind: "line"; entryId: string; name: string; flag: ProductFlag }
  // A part of a build group that can't
  | {
      kind: "group-part"
      buildId: string
      number: number | null
      name: string
      flag: ProductFlag
    }
  // A group whose current parts have compatibility errors
  | {
      kind: "build-errors"
      buildId: string
      number: number | null
      issues: Issue[]
    }
  // Delivery to the chosen region has no rate (needs an address)
  | { kind: "no-rate"; region: string }

// Unavailable and over-stock lines in cart order (a group's parts in builder
// order), then each group's errors in cart order. Nothing is stored or
// recomputed: the flags and the issues are the cart page's.
export function cartProblems(view: CartView): ReviewProblem[] {
  const stock: ReviewProblem[] = []
  const errors: ReviewProblem[] = []
  for (const entry of view.entries) {
    if (entry.kind === "single") {
      if (entry.flag) {
        stock.push({
          kind: "line",
          entryId: entry.id,
          name: entry.name,
          flag: entry.flag,
        })
      }
      continue
    }
    for (const part of entry.flags) {
      stock.push({
        kind: "group-part",
        buildId: entry.buildId,
        number: entry.number,
        name: part.name,
        flag: part.flag,
      })
    }
    const issues = entry.issues.filter((issue) => issue.severity === "error")
    if (issues.length > 0) {
      errors.push({
        kind: "build-errors",
        buildId: entry.buildId,
        number: entry.number,
        issues,
      })
    }
  }
  return [...stock, ...errors]
}
