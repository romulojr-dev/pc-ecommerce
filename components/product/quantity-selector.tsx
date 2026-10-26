"use client"

import { MinusIcon, PlusIcon } from "lucide-react"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { clampQuantity } from "@/lib/stock"

type QuantitySelectorProps = {
  // Units available: the stock, or a pre-order's allocation
  max: number
  // Out of stock: nothing to choose
  disabled?: boolean
}

// How many units to buy, from 1 to max (docs/specs/010-product-page). Local
// state only until the cart reads it. The text is kept as typed and clamped
// on blur, so clearing the field to type a new number works.
export function QuantitySelector({
  max,
  disabled = false,
}: QuantitySelectorProps) {
  const id = useId()
  const [text, setText] = useState("1")
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
          onClick={() => setText(String(quantity - 1))}
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
          onChange={(event) => setText(event.target.value)}
          onBlur={() => setText(String(quantity))}
          className="h-8 w-16 text-center tabular-nums"
        />
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label="Increase quantity"
          disabled={disabled || quantity >= max}
          onClick={() => setText(String(quantity + 1))}
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
