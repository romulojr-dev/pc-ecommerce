import type { ShareFailure } from "./share"

// The line the share dialog shows for a failed share (docs/specs/022-share-
// build, Messages). `nameOf` finds a part's name from its id, for the
// quantity message; the dialog has the loaded parts.
export const SHARE_ERROR_GENERIC = "We couldn't create a link. Try again."

export function shareErrorText(
  failure: ShareFailure,
  nameOf: (productId: string) => string | undefined = () => undefined
): string {
  switch (failure.reason) {
    case "unavailable":
      return "A part in your build is no longer available. Reload the page to update your build."
    case "too-many-parts":
      return "Your build has too many parts to share."
    case "quantity-too-high":
      return `You can share up to ${failure.max} of one part. Lower the quantity of ${
        nameOf(failure.productId)
          ? `the ${nameOf(failure.productId)}`
          : "that part"
      } and try again.`
    default:
      return SHARE_ERROR_GENERIC
  }
}
