import Link from "next/link"

import { CART_COPY } from "@/lib/cart/copy"
import { focusRing } from "@/lib/utils"
import { cn } from "@/lib/utils"

// What the line under the product page's buttons says after Add to cart
// (docs/specs/025-cart-single-items, Behavior 10)
export type AddOutcome =
  // The lines to show: what was added, then why not more
  | { kind: "added"; lines: string[] }
  // Stock or status changed since the page loaded
  | { kind: "unavailable" }
  | { kind: "error" }

// The live region is always in the page so a screen reader announces what is
// put into it; an error is announced at once as an alert. The region is
// aria-live rather than role="status" so the product page keeps one status
// role, Add to build's, which its tests and the shopper's tools find by role
// (docs/specs/025-cart-single-items, Behavior 10). No client hooks.
export function AddToCartResult({ outcome }: { outcome: AddOutcome | null }) {
  const lines =
    outcome?.kind === "added"
      ? outcome.lines
      : outcome?.kind === "unavailable"
        ? [CART_COPY.unavailable]
        : []

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="text-sm">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {outcome?.kind === "added" && (
          <Link
            href="/cart"
            className={cn(
              "inline-block rounded-sm font-medium underline underline-offset-4",
              focusRing
            )}
          >
            {CART_COPY.viewCart}
          </Link>
        )}
      </div>
      {outcome?.kind === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {CART_COPY.addFailed}
        </p>
      )}
    </>
  )
}
