import { first } from "./raw"
import type { ListingFilter } from "./types"

// Only products that can be bought and shipped now: in stock or low stock,
// not out of stock or pre-order (docs/specs/012-common-filters)
export type InStockFilterValue = true

export const inStockFilter = {
  key: "inStock",

  // ?inStock=1; anything else is off
  parse(raw) {
    return first(raw.inStock) === "1" ? true : null
  },

  serialize() {
    return [["inStock", "1"]]
  },

  chips() {
    return [{ label: "In stock only", without: null }]
  },
} satisfies ListingFilter<InStockFilterValue>
