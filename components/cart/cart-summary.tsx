import { Button } from "@/components/ui/button"
import { subtotalLabel } from "@/lib/cart/copy"
import { formatPeso } from "@/lib/format"

const CHECKOUT_NOTE_ID = "checkout-coming-soon"

// The cart's summary (docs/specs/025-cart-single-items, Behavior 18): the
// subtotal at today's prices and a Checkout button that does nothing yet. No
// client hooks.
export function CartSummary({
  count,
  subtotal,
}: {
  // The cart count, the same number as the header's
  count: number
  // Centavos
  subtotal: number
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
        <Button
          size="lg"
          disabled
          aria-describedby={CHECKOUT_NOTE_ID}
          className="h-10 w-full text-sm"
        >
          Checkout
        </Button>
        {/* Visible text, not a tooltip: disabled buttons can't be focused or
            hovered */}
        <p id={CHECKOUT_NOTE_ID} className="text-sm text-muted-foreground">
          Checkout is coming soon.
        </p>
      </div>
    </aside>
  )
}
