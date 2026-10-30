"use client"

import { MinusIcon, PlusIcon } from "lucide-react"
import { useId } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { clampQuantity } from "@/lib/stock"

type QuantitySelectorProps = {
  // Units available: the stock, or a pre-order's allocation, at most 99
  max: number
  // The field's text, kept as typed: the parent owns it and reads the
  // quantity with clampQuantity
  text: string
  onTextChange: (text: string) => void
  // Nothing to choose: out of stock, or not buyable
  disabled?: boolean
}

// How many units to buy, from 1 to max (docs/specs/010-product-page; the
// cart reads it, docs/specs/025-cart-single-items). The text is clamped on
// blur, so clearing the field to type a new number works.
export function QuantitySelector({
  max,
  text,
  onTextChange,
  disabled = false,
}: QuantitySelectorProps) {
  const id = useId()
  const quantity = clampQuantity(Number(text), max)

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Quantity</Label>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label="Decrease quantity"
          disabled={disabled || quantity <= 1}
          onClick={() => onTextChange(String(quantity - 1))}
        >
          <MinusIcon aria-hidden="true" />
        </Button>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          value={disabled ? "" : text}
          disabled={disabled}
          onChange={(event) => onTextChange(event.target.value)}
          onBlur={() => onTextChange(String(quantity))}
          className="h-8 w-16 text-center tabular-nums"
        />
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label="Increase quantity"
          disabled={disabled || quantity >= max}
          onClick={() => onTextChange(String(quantity + 1))}
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
