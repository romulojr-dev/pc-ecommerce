import type { Issue } from "@/lib/builder"

import {
  BUILD_COPY,
  buildQuantityText,
  shortageText,
  unavailableText,
} from "./copy"
import type { BuildCartResult } from "./types"

// What the builder says for each result of Add build to cart (docs/specs/
// 026-add-build-to-cart, Behavior 5 and 7). Pure: the copy is made here from
// the result, as the cart's does, and the cart id never appears in it.

export type BuildResultView =
  | { kind: "success"; text: string }
  // `lead` heads a list of lines; some results are a single line without one
  | { kind: "alert"; lead: string | null; lines: string[] }
  // Warnings the shopper hasn't confirmed: back to the dialog
  | { kind: "confirm"; warnings: Issue[] }

export const FAILED_VIEW = {
  kind: "alert",
  lead: null,
  lines: [BUILD_COPY.failed],
} as const satisfies BuildResultView

export function buildResultView(
  result: BuildCartResult,
  nameOf: (productId: string) => string | undefined = () => undefined
): BuildResultView {
  if (result.ok) {
    return {
      kind: "success",
      text: result.status === "added" ? BUILD_COPY.added : BUILD_COPY.already,
    }
  }
  switch (result.reason) {
    case "errors":
      return {
        kind: "alert",
        lead: BUILD_COPY.refused,
        lines: result.issues.map((issue) => issue.message),
      }
    case "stock":
      return {
        kind: "alert",
        lead: BUILD_COPY.refused,
        lines: result.shortages.map(shortageText),
      }
    case "unavailable":
      return {
        kind: "alert",
        lead: null,
        lines: [unavailableText(result.parts)],
      }
    case "confirm":
      return { kind: "confirm", warnings: result.warnings }
    case "quantity-too-high":
      return {
        kind: "alert",
        lead: null,
        lines: [buildQuantityText(result.max, nameOf(result.productId))],
      }
    default:
      return FAILED_VIEW
  }
}

// After a refusal for a reason the data can change, the builder loads its
// parts again, so the summary, the button and the slots catch up with what
// the server saw (D14). A stock refusal depends on the cart, not the parts.
export function reloadsParts(result: BuildCartResult): boolean {
  return (
    !result.ok &&
    (result.reason === "errors" ||
      result.reason === "unavailable" ||
      result.reason === "confirm")
  )
}
