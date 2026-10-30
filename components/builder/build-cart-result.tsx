import Link from "next/link"

import { CART_COPY } from "@/lib/cart/copy"
import type { BuildResultView } from "@/lib/cart/build-result"
import { cn, focusRing } from "@/lib/utils"

// What the line under Add build to cart says after a click (docs/specs/026-
// add-build-to-cart, Behavior 5). The live region is always in the page so a
// screen reader announces what is put into it; a refusal is also an alert.
// It is aria-live rather than role="status" so the builder keeps the one
// status role it has. A `confirm` isn't shown here: it opens the dialog. No
// client hooks.
export function BuildCartResult({ view }: { view: BuildResultView | null }) {
  return (
    <div aria-live="polite" className="flex flex-col gap-2 text-sm">
      {view?.kind === "success" && (
        <>
          <p>{view.text}</p>
          <Link
            href="/cart"
            className={cn(
              "w-fit rounded-sm font-medium underline underline-offset-4",
              focusRing
            )}
          >
            {CART_COPY.viewCart}
          </Link>
        </>
      )}
      {view?.kind === "alert" && (
        <div role="alert" className="flex flex-col gap-1 text-destructive">
          {view.lead && <p>{view.lead}</p>}
          {view.lines.length === 1 && !view.lead ? (
            <p>{view.lines[0]}</p>
          ) : (
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {view.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
