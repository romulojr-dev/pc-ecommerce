// What the cart actions return (docs/specs/025-cart-single-items, §6). The
// cart id never appears here: it lives in the cookie and nowhere else.

// Why a quantity ended below what the shopper asked for
export type CartNote =
  { kind: "stock"; stock: number; total: number } | { kind: "max"; max: number }

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
