"use client"

import { type ReactNode, useState } from "react"

import { addToCartAction } from "@/app/(store)/cart/actions"
import type { AddOutcome } from "@/components/product/add-to-cart-result"
import { PurchaseView } from "@/components/product/purchase-view"
import { MAX_CART_QUANTITY } from "@/lib/cart/cap"
import { addOutcomeLines } from "@/lib/cart/copy"
import { cartCountStore } from "@/lib/cart/count-store"
import { clampQuantity } from "@/lib/stock"

type PurchaseProps = {
  productId: string
  // Units in stock now
  stock: number
  buyable: boolean
  builderPart: boolean
  addToBuild: ReactNode
}

// Quantity and Add to cart on the product page (docs/specs/025-cart-single-
// items, Behavior 7–11). It adds the selected quantity, shows the result, and
// hands the cart's new count to the header through the shared store, so the
// badge changes without a page load. The server decides everything: stock
// caps, buyable, the cart itself.
export function Purchase({
  productId,
  stock,
  buyable,
  builderPart,
  addToBuild,
}: PurchaseProps) {
  const max = Math.min(stock, MAX_CART_QUANTITY)
  const [text, setText] = useState("1")
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<AddOutcome | null>(null)

  async function add() {
    setPending(true)
    try {
      const result = await addToCartAction({
        productId,
        quantity: clampQuantity(Number(text), max),
      })
      if (result.ok) {
        cartCountStore.getState().fromAction(result.count)
        setOutcome({
          kind: "added",
          lines: addOutcomeLines(result.added ?? 0, result.note),
        })
      } else {
        setOutcome({
          kind: result.reason === "unavailable" ? "unavailable" : "error",
        })
      }
    } catch {
      setOutcome({ kind: "error" })
    } finally {
      setPending(false)
    }
  }

  return (
    <PurchaseView
      text={text}
      onTextChange={setText}
      max={max}
      buyable={buyable}
      builderPart={builderPart}
      pending={pending}
      outcome={outcome}
      onAdd={add}
      addToBuild={addToBuild}
    />
  )
}
