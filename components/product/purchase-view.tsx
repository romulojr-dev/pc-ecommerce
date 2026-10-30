import type { ReactNode } from "react"

import {
  AddToCartResult,
  type AddOutcome,
} from "@/components/product/add-to-cart-result"
import { QuantitySelector } from "@/components/product/quantity-selector"
import { Button } from "@/components/ui/button"
import { CART_COPY, notBuyableText } from "@/lib/cart/copy"

// The one visible reason Add to cart and Add to build are disabled
export const PURCHASE_NOTE_ID = "purchase-unavailable"

type PurchaseViewProps = {
  // The quantity field's text and the most it can hold (stock, at most 99)
  text: string
  onTextChange: (text: string) => void
  max: number
  // In stock or low stock and active: the only parts that can be added
  buyable: boolean
  // A builder part also has Add to build, so the note names both
  builderPart: boolean
  pending: boolean
  outcome: AddOutcome | null
  onAdd: () => void
  // The Add to build button, from the server page (nothing outside the
  // builder categories)
  addToBuild: ReactNode
}

// Quantity, Add to cart and Add to build, and what Add to cart said
// (docs/specs/025-cart-single-items, Behavior 7–10, D9, D13). Presentational:
// Purchase owns the state and calls the action, so this can be tested alone.
export function PurchaseView({
  text,
  onTextChange,
  max,
  buyable,
  builderPart,
  pending,
  outcome,
  onAdd,
  addToBuild,
}: PurchaseViewProps) {
  return (
    <>
      <QuantitySelector
        max={max}
        text={text}
        onTextChange={onTextChange}
        disabled={!buyable}
      />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            size="lg"
            disabled={!buyable || pending}
            aria-busy={pending}
            aria-describedby={buyable ? undefined : PURCHASE_NOTE_ID}
            onClick={onAdd}
            className="h-10 px-6 text-sm"
          >
            {pending ? CART_COPY.adding : "Add to cart"}
          </Button>
          {addToBuild}
        </div>
        {/* Visible text, not a tooltip: disabled buttons can't be focused or
            hovered */}
        {!buyable && (
          <p id={PURCHASE_NOTE_ID} className="text-sm text-muted-foreground">
            {notBuyableText(builderPart)}
          </p>
        )}
        <AddToCartResult outcome={outcome} />
      </div>
    </>
  )
}
