"use client"

import { MinusIcon, PlusIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MAX_CART_QUANTITY } from "@/lib/cart/cap"

type CartQuantityProps = {
  // Names the part in the labels
  name: string
  quantity: number
  // The most this line can be raised to (the stock cap across the cart)
  max: number
  // A change for this line is running
  disabled: boolean
  // Sends an absolute quantity. The server caps it and answers with what it
  // kept, which comes back as `quantity`.
  onChange: (quantity: number) => void
}

// A cart line's stepper (docs/specs/025-cart-single-items, Behavior 19). The
// buttons send the new quantity at once; the field sends it on blur or Enter.
// An empty or non-number field goes back to the line's quantity without a
// request. The field shows the line's quantity again whenever the server
// answers with a different one (a capped change).
export function CartQuantity({
  name,
  quantity,
  max,
  disabled,
  onChange,
}: CartQuantityProps) {
  const [text, setText] = useState(String(quantity))
  const [shown, setShown] = useState(quantity)
  if (shown !== quantity) {
    // Derived from props during render, so the focus stays where it is
    setShown(quantity)
    setText(String(quantity))
  }

  function commit() {
    const value = Number(text)
    if (text.trim() === "" || !Number.isFinite(value)) {
      setText(String(quantity))
      return
    }
    const next = Math.min(Math.max(Math.trunc(value), 1), MAX_CART_QUANTITY)
    setText(String(next))
    if (next !== quantity) onChange(next)
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={`Decrease quantity of ${name}`}
        disabled={disabled || quantity <= 1}
        onClick={() => onChange(quantity - 1)}
      >
        <MinusIcon aria-hidden="true" />
      </Button>
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        aria-label={`Quantity of ${name}`}
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit()
        }}
        className="h-7 w-14 text-center tabular-nums"
      />
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={`Increase quantity of ${name}`}
        disabled={disabled || quantity >= max}
        onClick={() => onChange(quantity + 1)}
      >
        <PlusIcon aria-hidden="true" />
      </Button>
    </div>
  )
}
