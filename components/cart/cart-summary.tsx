import Link from "next/link"

import { Button, buttonVariants } from "@/components/ui/button"
import type { CheckoutButton } from "@/lib/checkout/button"
import { CART_BUTTON_COPY } from "@/lib/checkout/copy"
import { subtotalLabel } from "@/lib/cart/copy"
import { formatPeso } from "@/lib/format"
import { cn, focusRing } from "@/lib/utils"

const CHECKOUT_NOTE_ID = "checkout-blocked"

// The cart's summary (docs/specs/025-cart-single-items, Behavior 18): the
// subtotal at today's prices and the Checkout button. Checkout is a link to
// /checkout, or disabled with the reason as visible text while a line is
// flagged or a build has errors (docs/specs/029-checkout-steps, Behavior
// 1–2). No client hooks.
export function CartSummary({
  count,
  subtotal,
  checkout,
}: {
  // The cart count, the same number as the header's
  count: number
  // Centavos
  subtotal: number
  checkout: CheckoutButton
}) {
  return (
    <aside
      aria-label="Order summary"
      className="flex flex-col gap-4 rounded-lg border p-5 lg:sticky lg:top-6"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium">{subtotalLabel(count)}</h2>
        <p className="text-xl font-semibold tabular-nums">
          {formatPeso(subtotal)}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Shipping and vouchers are calculated at checkout.
      </p>
      <div className="flex flex-col gap-2">
        {checkout.enabled ? (
          <Link
            href="/checkout"
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-10 w-full text-sm",
              focusRing
            )}
          >
            Checkout
          </Link>
        ) : (
          <>
            <Button
              size="lg"
              disabled
              aria-describedby={CHECKOUT_NOTE_ID}
              className="h-10 w-full text-sm"
            >
              Checkout
            </Button>
            {/* Visible text, not a tooltip: disabled buttons can't be focused
                or hovered */}
            <div
              id={CHECKOUT_NOTE_ID}
              className="flex flex-col gap-1 text-sm text-muted-foreground"
            >
              {checkout.flagged && <p>{CART_BUTTON_COPY.flagged}</p>}
              {checkout.errors && <p>{CART_BUTTON_COPY.errors}</p>}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
