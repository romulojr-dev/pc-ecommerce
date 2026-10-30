import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { cn, focusRing } from "@/lib/utils"

// Where focus goes when the last line is removed
export const EMPTY_HEADING_ID = "cart-empty-heading"

// The empty cart (docs/specs/025-cart-single-items, Behavior 22): no cart, an
// unknown cookie, or no lines. No client hooks.
export function CartEmpty() {
  return (
    <section
      aria-labelledby={EMPTY_HEADING_ID}
      className="flex max-w-xl flex-col gap-3 py-8"
    >
      <h2
        id={EMPTY_HEADING_ID}
        tabIndex={-1}
        className="text-xl font-semibold tracking-tight outline-none"
      >
        Your cart is empty
      </h2>
      <p className="text-muted-foreground">
        Add parts from a product page, or plan a whole PC in the builder.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link
          href="/"
          className={cn(buttonVariants({ size: "lg" }), focusRing)}
        >
          Browse the home page
        </Link>
        <Link
          href="/builder"
          className={cn(
            buttonVariants({ size: "lg", variant: "outline" }),
            focusRing
          )}
        >
          Open the PC Builder
        </Link>
      </div>
    </section>
  )
}
