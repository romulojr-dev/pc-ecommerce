import { PRODUCT_COPY } from "./products-copy"
import type { ProductStatusName } from "./product-input"

// Labels for the product list (docs/specs/045-admin-products-create-edit, B4).
// Pure.

export const productStatusLabel = (status: ProductStatusName): string =>
  status === "DRAFT" ? PRODUCT_COPY.badges.draft : PRODUCT_COPY.badges.active

// The price column: the sale price first when there is one, with the regular
// price to be struck through
export function priceCells(
  price: number,
  salePrice: number | null
): { current: number; struck: number | null } {
  return salePrice === null
    ? { current: price, struck: null }
    : { current: salePrice, struck: price }
}
