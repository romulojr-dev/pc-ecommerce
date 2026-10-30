import type { CartNote } from "./types"

// The most of one product a cart holds (docs/specs/025-cart-single-items, D6)
export const MAX_CART_QUANTITY = 99

type CapInput = {
  op: "add" | "set"
  // Units to add, or the quantity to set the line to (at least 1)
  requested: number
  // The single-item line's quantity now (0 when there is none)
  line: number
  // The product's quantity in the cart's other lines (build groups)
  others: number
  // Units in stock now
  stock: number
}

// The stock cap (Rules › Stock cap): a product's total across every line of
// the cart may not pass min(stock, 99). A convenience, not a reservation.
// Adding fills what room is left. Setting never raises a line above the cap
// and never takes a line below what it already had, so lowering always
// works, even when stock dropped under the cart. A note says why the result
// is less than asked.
export function capQuantity({ op, requested, line, others, stock }: CapInput): {
  quantity: number
  note?: CartNote
} {
  const cap = Math.min(stock, MAX_CART_QUANTITY)
  const quantity =
    op === "add"
      ? line + Math.min(requested, Math.max(cap - line - others, 0))
      : requested <= line
        ? requested
        : Math.max(line, Math.min(requested, cap - others))

  const asked = op === "add" ? line + requested : requested
  if (quantity >= asked) return { quantity }

  const total = quantity + others
  return {
    quantity,
    // At exactly 99 in stock the stock is what the shopper can act on
    note:
      stock <= MAX_CART_QUANTITY
        ? { kind: "stock", stock, total }
        : { kind: "max", max: MAX_CART_QUANTITY },
  }
}
