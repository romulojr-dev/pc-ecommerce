import type { SharedRow } from "@/lib/build-state/shared"
import type { Slot } from "@/lib/builder"
import type { StockStatus } from "@/lib/stock"

// Stock flags on the cart page (docs/specs/027-cart-stock-flags). Pure: the
// server reads the cart's lines and the products, then asks here. A flag
// belongs to the product and shows on every line that holds it.

// The three reasons a product can't be bought, one treatment (spec 027 D1)
export type UnavailableKind = "retired" | "out-of-stock" | "pre-order"

export type ProductFlag =
  | { kind: UnavailableKind }
  // `total` is the product's units in the whole cart
  | { kind: "over-stock"; stock: number; total: number }

// A cart line of any kind: the single line or one of a group's
export type FlagLine = { productId: string; quantity: number }

export type FlagProduct = {
  // Not retired (Product.status is ACTIVE)
  active: boolean
  // Today's stock status (getStockStatus)
  status: StockStatus
  stock: number
}

// The flagged products of a cart. The first three states are the add test
// (active and buyable), so the cart and the product page never disagree.
// Unavailable wins over over stock: a product with no stock is "Out of
// stock", never "Only 0 in stock". Stock above 99 can't be crossed from the
// shop (the cap holds at min(stock, 99)), so the comparison is with stock.
export function productFlags(
  lines: readonly FlagLine[],
  products: ReadonlyMap<string, FlagProduct>
): Map<string, ProductFlag> {
  const held = new Map<string, number>()
  for (const { productId, quantity } of lines) {
    held.set(productId, (held.get(productId) ?? 0) + quantity)
  }

  const flags = new Map<string, ProductFlag>()
  for (const [productId, total] of held) {
    const product = products.get(productId)
    if (!product) continue
    if (!product.active) flags.set(productId, { kind: "retired" })
    else if (product.status === "out-of-stock") {
      flags.set(productId, { kind: "out-of-stock" })
    } else if (product.status === "pre-order") {
      flags.set(productId, { kind: "pre-order" })
    } else if (total > product.stock) {
      flags.set(productId, { kind: "over-stock", stock: product.stock, total })
    }
  }
  return flags
}

export const isUnavailable = (
  flag: ProductFlag | null
): flag is { kind: UnavailableKind } =>
  flag !== null && flag.kind !== "over-stock"

// What "Set to …" sets a single line to: the stock less what the product's
// other lines hold. Only for an over-stock line, and only when it can help:
// at least 1 and below the line's quantity. When the build groups hold all of
// the stock there is no button, and Remove is the way out (Behavior 7).
export function setToQuantity(
  flag: ProductFlag | null,
  quantity: number
): number | null {
  if (flag?.kind !== "over-stock") return null
  const n = flag.stock - (flag.total - quantity)
  return n >= 1 && n < quantity ? n : null
}

// One flagged part of a build group
export type GroupPartFlag = {
  productId: string
  name: string
  flag: ProductFlag
}

// The flagged parts of a group, in slot order. A row the group shows as no
// longer sold is flagged even when its product has no flag (it can be active
// but no longer a valid builder part, spec 026 Behavior 16).
export function groupPartFlags(
  slots: readonly { slot: Slot; rows: readonly SharedRow[] }[],
  flags: ReadonlyMap<string, ProductFlag>
): GroupPartFlag[] {
  return slots.flatMap(({ rows }) =>
    rows.flatMap((row): GroupPartFlag[] => {
      const productId = row.kind === "part" ? row.data.part.id : row.id
      const name = row.kind === "part" ? row.data.part.name : row.name
      const flag =
        flags.get(productId) ??
        (row.kind === "retired" ? ({ kind: "retired" } as const) : null)
      return flag ? [{ productId, name, flag }] : []
    })
  )
}

// How many lines need attention: a flagged single line, or a group with a
// flagged part. A group counts once, however many parts are flagged.
export function flaggedCount(
  entries: readonly (
    | { kind: "single"; flag: ProductFlag | null }
    | { kind: "build"; flags: readonly unknown[] }
  )[]
): number {
  return entries.filter((entry) =>
    entry.kind === "single" ? entry.flag !== null : entry.flags.length > 0
  ).length
}
