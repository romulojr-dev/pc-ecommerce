import type { StockStatus } from "@/lib/stock"

// What the cart actions return (docs/specs/025-cart-single-items, §6). The
// cart id never appears here: it lives in the cookie and nowhere else.

// Why a quantity ended below what the shopper asked for
export type CartNote =
  { kind: "stock"; stock: number; total: number } | { kind: "max"; max: number }

// One single-item line of /cart, with the product read fresh
export type CartLineView = {
  id: string
  productId: string
  name: string
  slug: string
  categorySlug: string
  brand: string
  image: { url: string; alt: string } | null
  // Centavos: the regular price, the sale price, and what the shopper pays
  price: number
  salePrice: number | null
  unitPrice: number
  quantity: number
  lineTotal: number
  status: StockStatus
  // "YYYY-MM-DD" while on pre-order
  preorderShipsOn: string | null
  // False once the product is retired (status not ACTIVE): the line stays but
  // has no price, no stepper and no place in the subtotal
  sold: boolean
  // The most this line can be raised to: min(stock, 99) less the product's
  // quantity in the cart's other lines, never below the line itself
  max: number
}

export type CartView = {
  lines: CartLineView[]
  // Centavos: lines that are still sold, at today's prices
  subtotal: number
  // cartCount of every line, build groups included
  count: number
}

export type CartFailure = "invalid" | "unavailable" | "not-found" | "error"

export type CartResult =
  | {
      ok: true
      // The cart's new count (cartCount), for the header
      count: number
      // The single-item line after the change; null when there is none
      // (removed, or a capped add that added nothing to an empty line)
      line: { id: string; quantity: number } | null
      // Units an add put in the cart
      added?: number
      note?: CartNote
    }
  | { ok: false; reason: CartFailure }
