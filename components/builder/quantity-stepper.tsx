import { MinusIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

type QuantityStepperProps = {
  // Names the part in the buttons' labels
  partName: string
  quantity: number
  // The part's stock now. A saved quantity above it is kept, and only
  // decreasing is allowed until it fits.
  stock: number
  // Increasing needs a buyable part (docs/specs/020-builder-page, Behavior 14)
  buyable: boolean
  onChange: (quantity: number) => void
}

// How many of a memory kit or drive, from 1 up to the stock. Buttons only,
// so every value it can reach is a valid one.
export function QuantityStepper({
  partName,
  quantity,
  stock,
  buyable,
  onChange,
}: QuantityStepperProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-xs text-muted-foreground">Quantity</span>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={`Decrease quantity of ${partName}`}
        disabled={quantity <= 1}
        onClick={() => onChange(quantity - 1)}
      >
        <MinusIcon aria-hidden="true" />
      </Button>
      <output
        aria-label={`Quantity of ${partName}`}
        className="min-w-6 text-center text-sm tabular-nums"
      >
        {quantity}
      </output>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={`Increase quantity of ${partName}`}
        disabled={!buyable || quantity >= stock}
        onClick={() => onChange(quantity + 1)}
      >
        <PlusIcon aria-hidden="true" />
      </Button>
    </div>
  )
}
