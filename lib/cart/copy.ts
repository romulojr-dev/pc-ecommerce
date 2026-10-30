import type { Shortage } from "./build-stock"
import { MAX_CART_QUANTITY } from "./cap"
import type { GroupPartFlag, ProductFlag } from "./flags"
import type { CartNote, UnavailablePart } from "./types"

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

// Add build to cart (docs/specs/026-add-build-to-cart, §5)
export const BUILD_COPY = {
  added: "Added your build to your cart.",
  already: "This build is already in your cart.",
  refused: "This build can't be added to your cart:",
  failed: "Couldn't add your build to your cart. Try again.",
  dialogTitle: "Add a build with warnings?",
} as const

// One short product: what the shopper has to fix
export function shortageText(short: Shortage): string {
  if (short.limit === "max") {
    const are = short.inCart === 1 ? "1 is" : `${short.inCart} are`
    return `Not enough room for ${short.name}: you can have up to ${MAX_CART_QUANTITY} of one part in your cart, and ${are} already in it.`
  }
  const held =
    short.inCart > 0
      ? `${short.inCart} already in your cart`
      : `your build needs ${short.needs}`
  return `Not enough stock for ${short.name}: ${short.stock} in stock, ${held}.`
}

// Parts the server won't add: named when there is one, counted when several
export function unavailableText(parts: readonly UnavailablePart[]): string {
  if (parts.length === 1) {
    const [{ name, why }] = parts
    const what =
      why === "retired" ? "is no longer sold" : "can't be bought right now"
    return `The ${name} ${what}. Replace it in the builder to add this build to cart.`
  }
  return `${parts.length} parts in this build can't be bought right now or are no longer sold. Replace them in the builder to add this build to cart.`
}

// The line above the warnings in the dialog. `changed` is for warnings the
// server found that the shopper hadn't seen.
export function warningsLead(count: number, changed: boolean): string {
  const noun = count === 1 ? "this warning" : "these warnings"
  return changed
    ? `Something in your build changed since it loaded. Check ${noun} before adding it:`
    : `Your build may still work, but check ${noun} first:`
}

export function buildQuantityText(max: number, name?: string): string {
  return `You can add up to ${max} of ${name ? `the ${name}` : "one part"} in a build.`
}

// A group's name; numbered (from 1) only when the cart has two or more
export function groupName(number: number | null): string {
  return number === null ? "Custom PC build" : `Custom PC build ${number}`
}

export function groupLabel(number: number | null, partCount: number): string {
  return `${groupName(number)} · ${partCount} ${partCount === 1 ? "part" : "parts"}`
}

export function removedGroupText(number: number | null): string {
  return `Removed ${groupName(number)} from your cart.`
}

// Stock flags (docs/specs/027-cart-stock-flags, §5). The three unavailable
// labels share one treatment; "No longer sold" is also what spec 025 shows.
export function flagText(flag: ProductFlag): string {
  switch (flag.kind) {
    case "retired":
      return "No longer sold"
    case "out-of-stock":
      return "Out of stock"
    case "pre-order":
      return "Pre-order only"
    case "over-stock":
      return `Only ${flag.stock} in stock, ${flag.total} in your cart`
  }
}

// The flag under a group's label, also when it is collapsed: one part is
// named, several are counted
export function groupFlagText(parts: readonly GroupPartFlag[]): string {
  if (parts.length === 1) return `${parts[0].name}: ${flagText(parts[0].flag)}`
  return `${parts.length} parts need attention`
}

export function bannerText(count: number): string {
  return count === 1
    ? "1 line needs attention. Fix or remove it before you check out."
    : `${count} lines need attention. Fix or remove them before you check out.`
}

// Under "Pre-order only", where the stock line's ship date would have been
export function shipsText(date: string): string {
  return `Ships ${date}`
}

export function setToLabel(quantity: number): string {
  return `Set to ${quantity}`
}

export function setToAriaLabel(name: string, quantity: number): string {
  return `Set ${name} to ${quantity}`
}

export function setToStatusText(name: string, quantity: number): string {
  return `Set ${name} to ${quantity}.`
}
