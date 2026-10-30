import type { SharedRow, SharedStatus } from "@/lib/build-state/shared"
import type { Issue, Slot } from "@/lib/builder"
import type { ShareFailure } from "@/lib/build-state/share"
import type { StockStatus } from "@/lib/stock"

import type { Shortage } from "./build-stock"

// What the cart actions return (docs/specs/025-cart-single-items, §6). The
// cart id never appears here: it lives in the cookie and nowhere else.

// Why a quantity ended below what the shopper asked for
export type CartNote =
  { kind: "stock"; stock: number; total: number } | { kind: "max"; max: number }

// One single-item line of /cart, with the product read fresh
export type CartLineView = {
  kind: "single"
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

// One build group of /cart (docs/specs/026-add-build-to-cart, Behavior 13–16):
// the snapshot's parts read fresh, with the total, status and issues from
// the same pure view the shared page uses
export type CartGroupView = {
  kind: "build"
  buildId: string
  // The snapshot's share link: /builds/{slug}
  slug: string
  // 1-based, in cart order, only when the cart has two or more groups
  number: number | null
  // Products in the group, retired ones included
  partCount: number
  // Centavos, of the parts that are still sold
  total: number
  status: SharedStatus
  issues: readonly Issue[]
  // The slots that hold parts, in builder order
  slots: { slot: Slot; rows: SharedRow[] }[]
}

export type CartEntry = CartLineView | CartGroupView

export type CartView = {
  // Single lines and build groups together, oldest first (spec 025 D10)
  entries: CartEntry[]
  // Centavos: single lines that are still sold, plus every group's total
  subtotal: number
  // cartCount of every line, build groups included
  count: number
}

// The id the cart page and its actions use for an entry: a line's id, or a
// group's build id
export const entryId = (entry: CartEntry): string =>
  entry.kind === "single" ? entry.id : entry.buildId

// The single-item lines of a view
export const singleLines = (view: CartView): CartLineView[] =>
  view.entries.filter((entry): entry is CartLineView => entry.kind === "single")

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

// A part Add build to cart won't take
export type UnavailablePart = { name: string; why: "not-buyable" | "retired" }

// What addBuildToCart answers (docs/specs/026-add-build-to-cart, §6). `confirm`
// holds every warning of the build, for the dialog. The cart id never appears.
export type BuildCartResult =
  | { ok: true; status: "added" | "already-in-cart"; count: number }
  | { ok: false; reason: "errors"; issues: Issue[] }
  | { ok: false; reason: "confirm"; warnings: Issue[] }
  | { ok: false; reason: "unavailable"; parts: UnavailablePart[] }
  | { ok: false; reason: "stock"; shortages: Shortage[] }
  | { ok: false; reason: "invalid" | "empty" | "too-many-parts" | "error" }
  | Extract<ShareFailure, { reason: "quantity-too-high" }>
