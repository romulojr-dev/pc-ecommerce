import { first } from "./raw"
import type { ListingFilter } from "./types"

// Only products on sale: a sale price below the list price. "View all deals"
// on the home page links to search with it (docs/specs/016-home-page).
export type OnSaleFilterValue = true

export const onSaleFilter = {
  key: "onSale",

  // ?onSale=1; anything else is off
  parse(raw) {
    return first(raw.onSale) === "1" ? true : null
  },

  serialize() {
    return [["onSale", "1"]]
  },

  chips() {
    return [{ label: "On sale", without: null }]
  },
} satisfies ListingFilter<OnSaleFilterValue>
