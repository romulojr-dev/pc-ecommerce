import {
  type FilterKey,
  type FilterList,
  type FilterValues,
  listingFilters,
  parseFilters,
  serializeFilters,
  setFilter,
} from "@/lib/listing-filters"
import { first } from "@/lib/listing-filters/raw"
import type { RawSearchParams } from "@/lib/listing-filters/types"
import { categoryHref } from "@/lib/site"

// URL state of a category listing (docs/specs/008-category-listing). Parse
// and serialize live here only, so each state has one URL. The filters
// (docs/specs/012-common-filters) each parse and serialize their own keys in
// lib/listing-filters; this module puts them together with sort and page.
// Spec filters differ by category (docs/specs/013-spec-filters), so parsing
// and writing a query take the listing's target: what the listing is of.

export const SORTS = ["newest", "price-asc", "price-desc"] as const
export type ListingSort = (typeof SORTS)[number]
export const DEFAULT_SORT: ListingSort = "newest"

export const SORT_LABELS: Record<ListingSort, string> = {
  newest: "Newest",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
}

// 6 rows of the 4-column desktop grid
export const PAGE_SIZE = 24

export type ListingState = {
  sort: ListingSort
  page: number
  filters: FilterValues
}

export type { RawSearchParams }

// What a listing shows (docs/specs/014-search): today a category. Plain data,
// so server pages can hand it to the client listing components.
export type ListingTarget = { kind: "category"; slug: string }

export function categoryTarget(slug: string): ListingTarget {
  return { kind: "category", slug }
}

// The target's filters in URL order
export function filtersFor(target: ListingTarget): FilterList {
  return listingFilters(target.slug)
}

function isSort(value: string | undefined): value is ListingSort {
  return SORTS.some((sort) => sort === value)
}

// Never throws: an unknown sort or a page that isn't a positive integer
// falls back to the default, each filter ignores its own bad values, and
// keys that aren't one of the category's filters are ignored
export function parseListingParams(
  target: ListingTarget,
  raw: RawSearchParams
): ListingState {
  const sort = first(raw.sort)
  const page = first(raw.page)
  const pageNumber = page && /^[1-9]\d*$/.test(page) ? Number(page) : 1

  return {
    sort: isSort(sort) ? sort : DEFAULT_SORT,
    page: Number.isSafeInteger(pageNumber) ? pageNumber : 1,
    filters: parseFilters(raw, filtersFor(target)),
  }
}

// The state with one filter changed (null removes it). Always back on page 1:
// the old page number means nothing for a different set of results.
export function withFilter<K extends FilterKey>(
  state: ListingState,
  key: K,
  value: FilterValues[K] | null
): ListingState {
  return { ...state, filters: setFilter(state.filters, key, value), page: 1 }
}

// No filters, page 1; the sort stays since it isn't a filter
export function clearFilters(state: ListingState): ListingState {
  return { ...state, filters: {}, page: 1 }
}

// "brand=amd&maxPrice=20000&sort=price-desc&page=2": the filters, then sort
// and page; defaults omitted, keys in a fixed order, "" when everything is
// the default
export function listingQuery(
  target: ListingTarget,
  state: ListingState
): string {
  const params = new URLSearchParams()
  for (const [key, value] of serializeFilters(
    state.filters,
    filtersFor(target)
  )) {
    params.append(key, value)
  }
  if (state.sort !== DEFAULT_SORT) params.set("sort", state.sort)
  if (state.page !== 1) params.set("page", String(state.page))
  return params.toString()
}

export function listingHref(
  target: ListingTarget,
  state: ListingState
): string {
  const query = listingQuery(target, state)
  const path = categoryHref(target.slug)
  return query ? `${path}?${query}` : path
}

// True when the request's query is exactly the state's canonical one. Anything
// else (bad values, defaults spelled out, unknown keys) gets redirected.
export function isCanonicalQuery(
  target: ListingTarget,
  raw: RawSearchParams,
  state: ListingState
): boolean {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(raw)) {
    for (const item of [value ?? []].flat()) params.append(key, item)
  }
  return params.toString() === listingQuery(target, state)
}

// At least 1, so an empty category still has a page 1
export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE))
}

export type PaginationItem = number | "ellipsis"

// Page links for the pager: all pages up to 7, otherwise always 7 items, with
// the first, the last and the current page's neighbours
export function paginationItems(
  current: number,
  count: number
): PaginationItem[] {
  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i)

  if (count <= 7) return range(1, count)
  if (current <= 4) return [...range(1, 5), "ellipsis", count]
  if (current >= count - 3) return [1, "ellipsis", ...range(count - 4, count)]
  return [1, "ellipsis", current - 1, current, current + 1, "ellipsis", count]
}

// Grid or list: a display preference kept in a cookie, not in the URL
export const VIEW_COOKIE = "listing-view"
export const VIEWS = ["grid", "list"] as const
export type ListingView = (typeof VIEWS)[number]

export function parseView(value: string | undefined): ListingView {
  return value === "list" ? "list" : "grid"
}
