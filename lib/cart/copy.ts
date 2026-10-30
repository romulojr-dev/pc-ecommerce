import type { CartNote } from "./types"

// Shopper copy for the cart (docs/specs/025-cart-single-items, §5)
export const CART_COPY = {
  adding: "Adding…",
  viewCart: "View cart",
  unavailable: "This part can't be bought right now.",
  addFailed: "Couldn't add this to your cart. Try again.",
  updateFailed: "Couldn't update your cart. Try again.",
  gone: "That item is no longer in your cart.",
} as const

export function capNoteText(note: CartNote): string {
  return note.kind === "stock"
    ? `Only ${note.stock} in stock. You have ${note.total} in your cart.`
    : `You can have up to ${note.max} of one part in your cart.`
}

// The lines under the buttons after an add: what was added, then why not more
export function addOutcomeLines(added: number, note?: CartNote): string[] {
  if (!note) return ["Added to your cart."]
  const lines = [capNoteText(note)]
  return added > 0 ? [`Added ${added} to your cart.`, ...lines] : lines
}

export function removedText(name: string): string {
  return `Removed ${name} from your cart.`
}

// The product page's disabled reason; a builder part also has Add to build
export function notBuyableText(builderPart: boolean): string {
  return builderPart
    ? "Only parts in stock can be added to your cart or build."
    : "Only parts in stock can be added to your cart."
}

export function subtotalLabel(count: number): string {
  return `Subtotal (${count} ${count === 1 ? "item" : "items"})`
}
