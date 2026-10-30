import type { CartView } from "@/lib/cart/types"

// Whether /cart's Checkout button is a link
// (docs/specs/029-checkout-steps, Behavior 1–2): at least one entry, no
// flagged line, and no build group with errors. A group with a part that is
// no longer sold is already flagged.
export type CheckoutButton =
  { enabled: true } | { enabled: false; flagged: boolean; errors: boolean }

export function checkoutButton(view: CartView): CheckoutButton {
  const flagged = view.flagged > 0
  const errors = view.entries.some(
    (entry) => entry.kind === "build" && entry.status === "errors"
  )
  if (view.entries.length === 0 || flagged || errors) {
    return { enabled: false, flagged, errors }
  }
  return { enabled: true }
}
