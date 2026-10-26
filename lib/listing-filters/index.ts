import { brandFilter } from "./brand"
import { inStockFilter } from "./in-stock"
import { priceFilter } from "./price"
import type { FilterOption, ListingFilter, RawSearchParams } from "./types"

export type { FilterOption, ListingFilter, RawSearchParams } from "./types"

// The filters every category has (docs/specs/012-common-filters). The order
// is the order of their keys in the URL. Adding a filter: one file like
// brand.ts, an entry here, its database half in ./server.ts, and a group in
// the sidebar. Spec filters (story 3) and search (story 4) join this list.
export const commonFilters = {
  brand: brandFilter,
  price: priceFilter,
  inStock: inStockFilter,
}

export type FilterKey = keyof typeof commonFilters

// The active filters' values by key; an absent key is an inactive filter
export type FilterValues = {
  [K in FilterKey]?: NonNullable<ReturnType<(typeof commonFilters)[K]["parse"]>>
}

// Options by filter, for the filters that have them (brand)
export type FilterOptions = Partial<Record<FilterKey, FilterOption[]>>

const FILTER_KEYS = Object.keys(commonFilters) as FilterKey[]

// The generic loops below don't know each filter's value type
const filterOf = (key: FilterKey): ListingFilter<unknown> => commonFilters[key]

// Never throws: each filter ignores its own bad values
export function parseFilters(raw: RawSearchParams): FilterValues {
  const values: Record<string, unknown> = {}
  for (const key of FILTER_KEYS) {
    const value = filterOf(key).parse(raw)
    if (value !== null) values[key] = value
  }
  return values as FilterValues
}

// URL entries of the active filters, in filter order
export function serializeFilters(values: FilterValues): [string, string][] {
  return FILTER_KEYS.flatMap((key) => {
    const value = values[key]
    return value === undefined ? [] : filterOf(key).serialize(value)
  })
}

// Drops values that aren't among the filter's options (an unknown brand)
export function normalizeFilters(
  values: FilterValues,
  options: FilterOptions
): FilterValues {
  const next: Record<string, unknown> = { ...values }
  for (const key of FILTER_KEYS) {
    const filter = filterOf(key)
    const value = values[key]
    const known = options[key]
    if (value === undefined || !filter.normalize || !known) continue
    const kept = filter.normalize(value, known)
    if (kept === null) delete next[key]
    else next[key] = kept
  }
  return next as FilterValues
}

// The filters with `key` set to `value`, or removed when `value` is null
export function setFilter<K extends FilterKey>(
  values: FilterValues,
  key: K,
  value: FilterValues[K] | null
): FilterValues {
  const next = { ...values }
  if (value === null) delete next[key]
  else next[key] = value
  return next
}

export function activeFilterCount(values: FilterValues): number {
  return FILTER_KEYS.filter((key) => values[key] !== undefined).length
}

// A removable piece of an active filter, with the filters as they are once it
// is removed
export type ActiveFilterChip = {
  key: FilterKey
  label: string
  filters: FilterValues
}

export function activeFilterChips(
  values: FilterValues,
  options: FilterOptions
): ActiveFilterChip[] {
  return FILTER_KEYS.flatMap((key) => {
    const value = values[key]
    if (value === undefined) return []
    return filterOf(key)
      .chips(value, options[key] ?? [])
      .map(({ label, without }) => {
        const filters: Record<string, unknown> = { ...values }
        if (without === null) delete filters[key]
        else filters[key] = without
        return { key, label, filters: filters as FilterValues }
      })
  })
}
