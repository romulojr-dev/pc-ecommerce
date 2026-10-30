import type { BuildStatus } from "@/lib/builder"

// Add build to cart's button on /builder (docs/specs/026-add-build-to-cart,
// Behavior 1–2): enabled once the summary is ready, the build has parts, no
// errors, and every part is buyable. The client's verdict only drives the
// button; the server decides again. Warnings leave it enabled, since the
// click asks the shopper to confirm them.

export type BuildCartReason = "empty" | "errors" | "unavailable"

export type BuildCartButton = {
  enabled: boolean
  // Why it is disabled, in the order the page shows them. Loading and error
  // have none: the summary already says what is going on.
  reasons: BuildCartReason[]
}

export function buildCartButton({
  state,
  isEmpty,
  status,
  hasUnavailable,
}: {
  state: "loading" | "error" | "ready"
  isEmpty: boolean
  status: BuildStatus
  hasUnavailable: boolean
}): BuildCartButton {
  if (state !== "ready") return { enabled: false, reasons: [] }
  if (isEmpty) return { enabled: false, reasons: ["empty"] }

  const reasons: BuildCartReason[] = []
  if (status === "errors") reasons.push("errors")
  if (hasUnavailable) reasons.push("unavailable")
  return { enabled: reasons.length === 0, reasons }
}

// The visible text for a reason, or null for "unavailable": the summary's
// availability line already says which parts, so the button points at it
// (D12)
export function cartButtonReasonText(reason: BuildCartReason): string | null {
  switch (reason) {
    case "empty":
      return "Add parts to add your build to cart."
    case "errors":
      return "Fix the errors to add this build to cart."
    case "unavailable":
      return null
  }
}
