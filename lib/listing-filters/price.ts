import { formatPeso } from "@/lib/format"

import { first } from "./raw"
import type { ListingFilter } from "./types"

// A range of the effective price, in whole pesos (the UI and the URL; the
// query converts to centavos). Either bound may be missing.
export type PriceFilterValue = { min: number | null; max: number | null }

// Keeps the centavo value inside Postgres Int (2,147,483,647)
export const MAX_PRICE_PESOS = 10_000_000

// One bound: whole pesos without leading zeros, up to the cap, else null
// (the sidebar's price form validates its fields with it too)
export function parsePriceBound(value: string | undefined): number | null {
  if (!value || !/^(0|[1-9]\d{0,7})$/.test(value)) return null
  const pesos = Number(value)
  return pesos <= MAX_PRICE_PESOS ? pesos : null
}

// "₱10,000" (the filter works in whole pesos)
const pesos = (amount: number) => formatPeso(amount * 100).replace(/\.00$/, "")

export const priceFilter = {
  key: "price",

  // ?minPrice=10000&maxPrice=20000. Each bound stands alone: a bad one is
  // ignored and the other still applies. A minimum of 0 is no minimum, and
  // bounds in the wrong order are swapped (the range the shopper meant).
  parse(raw) {
    let min = parsePriceBound(first(raw.minPrice))
    let max = parsePriceBound(first(raw.maxPrice))
    if (min === 0) min = null
    if (min !== null && max !== null && min > max) [min, max] = [max, min]
    return min === null && max === null ? null : { min, max }
  },

  serialize({ min, max }) {
    const entries: [string, string][] = []
    if (min !== null) entries.push(["minPrice", String(min)])
    if (max !== null) entries.push(["maxPrice", String(max)])
    return entries
  },

  // One chip for the whole range: removing it clears both bounds
  chips({ min, max }) {
    const label =
      min !== null && max !== null
        ? min === max
          ? pesos(min)
          : `${pesos(min)} – ${pesos(max)}`
        : min !== null
          ? `from ${pesos(min)}`
          : `up to ${pesos(max!)}`
    return [{ label: `Price: ${label}`, without: null }]
  },
} satisfies ListingFilter<PriceFilterValue>
