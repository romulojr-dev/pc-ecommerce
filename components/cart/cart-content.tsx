"use client"

import { useEffect, useRef, useState } from "react"

import {
  removeFromCartAction,
  setCartQuantityAction,
} from "@/app/(store)/cart/actions"
import { CartBody } from "@/components/cart/cart-body"
import { EMPTY_HEADING_ID } from "@/components/cart/cart-empty"
import { type LineMessage, removeButtonId } from "@/components/cart/cart-line"
import { capNoteText, CART_COPY, removedText } from "@/lib/cart/copy"
import { cartCountStore } from "@/lib/cart/count-store"
import type { CartResult, CartView } from "@/lib/cart/types"

// The cart page's state (docs/specs/025-cart-single-items, Behavior 19–23): it
// sends each change to a server action, which answers with the new count for
// the header and refreshes the page, so the lines, totals and subtotal come
// back from the server. A line takes one change at a time.
export function CartContent({ view }: { view: CartView }) {
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [messages, setMessages] = useState<
    Record<string, LineMessage | undefined>
  >({})
  const [status, setStatus] = useState("")
  // After a removal: where focus goes once the removed line has left the page
  const refocus = useRef<{ removedId: string; focusId: string } | null>(null)

  useEffect(() => {
    const pending = refocus.current
    if (!pending || view.lines.some((line) => line.id === pending.removedId)) {
      return
    }
    refocus.current = null
    document.getElementById(pending.focusId)?.focus()
  }, [view.lines])

  const setMessage = (lineId: string, message: LineMessage | null) =>
    setMessages((current) => ({ ...current, [lineId]: message ?? undefined }))

  async function change(lineId: string, send: () => Promise<CartResult>) {
    setBusy((current) => new Set(current).add(lineId))
    try {
      const result = await send()
      if (result.ok) cartCountStore.getState().fromAction(result.count)
      return result
    } catch {
      return null
    } finally {
      setBusy((current) => {
        const next = new Set(current)
        next.delete(lineId)
        return next
      })
    }
  }

  // The reasons a change fails, the same for a quantity and a removal
  function explain(lineId: string, result: CartResult | null) {
    if (result && !result.ok && result.reason === "not-found") {
      // Removed in another tab: the refresh drops the line
      setStatus(CART_COPY.gone)
    } else if (result && !result.ok && result.reason === "unavailable") {
      setMessage(lineId, { kind: "error", text: CART_COPY.unavailable })
    } else {
      setMessage(lineId, { kind: "error", text: CART_COPY.updateFailed })
    }
  }

  async function setQuantity(lineId: string, quantity: number) {
    const result = await change(lineId, () =>
      setCartQuantityAction({ lineId, quantity })
    )
    if (result?.ok) {
      setMessage(
        lineId,
        result.note ? { kind: "note", text: capNoteText(result.note) } : null
      )
    } else {
      explain(lineId, result)
    }
  }

  async function remove(lineId: string) {
    const index = view.lines.findIndex((line) => line.id === lineId)
    const neighbour = view.lines[index + 1] ?? view.lines[index - 1]
    const result = await change(lineId, () => removeFromCartAction({ lineId }))
    if (result?.ok) {
      setStatus(removedText(view.lines[index].name))
      refocus.current = {
        removedId: lineId,
        focusId: neighbour ? removeButtonId(neighbour.id) : EMPTY_HEADING_ID,
      }
    } else {
      explain(lineId, result)
    }
  }

  return (
    <CartBody
      view={view}
      busy={busy}
      messages={messages}
      status={status}
      onQuantity={setQuantity}
      onRemove={remove}
    />
  )
}
