import { type BuildItem, SLOT_LIMITS, type Slot } from "@/lib/builder"

import { MAX_BUILD_PRODUCTS } from "./parts"

// What Add to build will do (docs/specs/020-builder-page, Behavior 19). It
// always adds one unit; the product page's quantity selector is Add to
// cart's (D15).
export type AddPlan =
  // A new entry, quantity 1
  | { kind: "add" }
  // The same memory kit or drive, one more
  | { kind: "raise"; quantity: number }
  // The same part in a one-part slot: nothing to do
  | { kind: "already" }
  // The same kit or drive, already at its stock
  | { kind: "at-stock"; stock: number }
  // A new drive in a build of MAX_BUILD_PRODUCTS products
  | { kind: "full" }
  // Another part in a one-part slot or memory: ask first. Memory keeps its
  // quantity, capped at the new kit's stock (D8)
  | { kind: "confirm-replace"; quantity: number }

export type AddCandidate = {
  slot: Slot
  productId: string
  // Units available now. Add to build is only offered for buyable parts,
  // so it is at least 1.
  stock: number
}

export function planAdd(
  items: readonly BuildItem[],
  { slot, productId, stock }: AddCandidate
): AddPlan {
  const inSlot = items.filter((item) => item.slot === slot)
  const same = inSlot.find((item) => item.productId === productId)
  const multipleUnits = SLOT_LIMITS[slot].quantity === "any"

  if (same) {
    if (!multipleUnits) return { kind: "already" }
    if (same.quantity >= stock) return { kind: "at-stock", stock }
    return { kind: "raise", quantity: same.quantity + 1 }
  }
  if (SLOT_LIMITS[slot].multipleEntries) {
    const products = new Set(items.map((item) => item.productId))
    return products.size >= MAX_BUILD_PRODUCTS
      ? { kind: "full" }
      : { kind: "add" }
  }
  if (inSlot.length === 0) return { kind: "add" }
  const quantity = multipleUnits ? Math.min(inSlot[0].quantity, stock) : 1
  return { kind: "confirm-replace", quantity }
}
