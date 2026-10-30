import { SLOTS, type Slot } from "@/lib/builder"

import { MAX_CART_QUANTITY } from "./cap"

// The stock check for adding a build (docs/specs/026-add-build-to-cart,
// Rules › Stock): all or nothing. Each product's quantity in the whole cart
// (its single line and every build group) plus what this build needs may not
// pass min(stock, 99). Nothing is capped; every short product is listed so
// one try shows everything to fix. Pure: the server reads the cart and the
// stock, then asks here.

// A product the build holds, with how many units it needs (a memory kit
// counts its quantity)
export type BuildNeed = {
  productId: string
  name: string
  slot: Slot
  needs: number
}

export type Shortage = {
  productId: string
  name: string
  stock: number
  inCart: number
  needs: number
  // What decided: the stock, or the 99-per-part limit when stock is above it
  // (at exactly 99 in stock the stock is what the shopper can act on)
  limit: "stock" | "max"
}

// In builder slot order; drives in one slot by name, A to Z
export function buildShortages(
  needs: readonly BuildNeed[],
  inCart: ReadonlyMap<string, number>,
  stock: ReadonlyMap<string, number>
): Shortage[] {
  const slotIndex = (slot: Slot) => SLOTS.indexOf(slot)
  return [...needs]
    .sort(
      (a, b) =>
        slotIndex(a.slot) - slotIndex(b.slot) ||
        a.name.localeCompare(b.name, "en") ||
        (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0)
    )
    .flatMap((need): Shortage[] => {
      const available = stock.get(need.productId) ?? 0
      const held = inCart.get(need.productId) ?? 0
      if (held + need.needs <= Math.min(available, MAX_CART_QUANTITY)) return []
      return [
        {
          productId: need.productId,
          name: need.name,
          stock: available,
          inCart: held,
          needs: need.needs,
          limit: available <= MAX_CART_QUANTITY ? "stock" : "max",
        },
      ]
    })
}
