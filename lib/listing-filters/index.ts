import {
  builderCategories,
  type FieldMeta,
  isBuilderCategory,
  type SpecFilterKind,
} from "@/lib/specs"

import { brandFilter } from "./brand"
import { categoryFilter } from "./category"
import { inStockFilter } from "./in-stock"
import { priceFilter } from "./price"
import { specFilter } from "./spec"
import type { FilterOption, ListingFilter, RawSearchParams } from "./types"

export type {
  FilterOption,
  ListingFilter,
  RawSearchParams,
  SpecFilterInfo,
} from "./types"

// The filters every category has (docs/specs/012-common-filters). The order
// is the order of their keys in the URL. Adding one: a file like brand.ts, an
// entry here, its database half in ./server.ts, and a group in the sidebar.
// Spec filters (docs/specs/013-spec-filters) follow them in each builder
// category's list. Search results (docs/specs/014-search) have them too,
// after a Category filter of their own.
export const commonFilters = {
  brand: brandFilter,
  price: priceFilter,
  inStock: inStockFilter,
}

export type CommonFilterKey = keyof typeof commonFilters

// Filters only search results have
export const searchOnlyFilters = {
  category: categoryFilter,
}

// The filters with a fixed key, so their values are typed
type NamedFilters = typeof commonFilters & typeof searchOnlyFilters
export type NamedFilterKey = keyof NamedFilters
// Common filter keys, or a spec field name
export type FilterKey = string

// The active filters' values by key; an absent key is an inactive filter.
// Common and search filters are typed; spec filters are known only per
// category, so their values are checked by their own filter object.
export type FilterValues = {
  [K in NamedFilterKey]?: NonNullable<ReturnType<NamedFilters[K]["parse"]>>
} & { [key: string]: unknown }

// Options by filter key, for the filters that have them
export type FilterOptions = Partial<Record<FilterKey, FilterOption[]>>

// A category's filters in URL order
export type FilterList = readonly ListingFilter<unknown>[]

const COMMON_FILTERS: FilterList = Object.values(commonFilters)

// Search results' filters in URL order: Category, then the common ones
export const searchFilters: FilterList = [
  ...Object.values(searchOnlyFilters),
  ...COMMON_FILTERS,
]

// Built once per builder category; other slugs share the common list, so
// nothing from the URL grows this cache
const listsBySlug = new Map<string, FilterList>()

// The filters of a category: the common ones, then a spec filter per field
// with a `filter` kind, in metadata order (docs/specs/013-spec-filters)
export function listingFilters(slug: string): FilterList {
  if (!isBuilderCategory(slug)) return COMMON_FILTERS
  let list = listsBySlug.get(slug)
  if (!list) {
    const fields: Record<string, FieldMeta> = builderCategories[slug].fields
    const specFilters = Object.entries(fields).flatMap(([field, meta]) =>
      meta.filter
        ? [
            specFilter(
              slug,
              field,
              meta as FieldMeta & { filter: SpecFilterKind }
            ),
          ]
        : []
    )
    list = [...COMMON_FILTERS, ...specFilters]
    listsBySlug.set(slug, list)
  }
  return list
}

// Never throws: each filter ignores its own bad values, and keys that aren't
// in the list (another category's field, a non-filterable one) are ignored
export function parseFilters(
  raw: RawSearchParams,
  filters: FilterList
): FilterValues {
  const values: Record<string, unknown> = {}
  for (const filter of filters) {
    const value = filter.parse(raw)
    if (value !== null) values[filter.key] = value
  }
  return values as FilterValues
}

// URL entries of the active filters, in list order
export function serializeFilters(
  values: FilterValues,
  filters: FilterList
): [string, string][] {
  return filters.flatMap((filter) => {
    const value = values[filter.key]
    return value === undefined ? [] : filter.serialize(value)
  })
}

// Drops values that aren't among the filter's options (an unknown brand, a
// socket the category doesn't have)
export function normalizeFilters(
  values: FilterValues,
  options: FilterOptions,
  filters: FilterList
): FilterValues {
  const next: Record<string, unknown> = { ...values }
  for (const filter of filters) {
    const value = values[filter.key]
    const known = options[filter.key]
    if (value === undefined || !filter.normalize || !known) continue
    const kept = filter.normalize(value, known)
    if (kept === null) delete next[filter.key]
    else next[filter.key] = kept
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
  return Object.values(values).filter((value) => value !== undefined).length
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
  options: FilterOptions,
  filters: FilterList
): ActiveFilterChip[] {
  return filters.flatMap((filter) => {
    const value = values[filter.key]
    if (value === undefined) return []
    return filter
      .chips(value, options[filter.key] ?? [])
      .map(({ label, without }) => {
        const next: Record<string, unknown> = { ...values }
        if (without === null) delete next[filter.key]
        else next[filter.key] = without
        return { key: filter.key, label, filters: next as FilterValues }
      })
  })
}
