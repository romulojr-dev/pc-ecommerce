import { categoryHref } from "@/lib/site"

// URL state of a category listing (docs/specs/008-category-listing). Parse
// and serialize live here only, so each state has one URL; Sprint 3's filters
// add their keys to ListingState, parseListingParams and listingQuery.

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

export type ListingState = { sort: ListingSort; page: number }

// The shape of a page's awaited searchParams
export type RawSearchParams = Record<string, string | string[] | undefined>

// A repeated key (?page=1&page=2) counts by its first value
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function isSort(value: string | undefined): value is ListingSort {
  return SORTS.some((sort) => sort === value)
}

// Never throws: an unknown sort or a page that isn't a positive integer
// falls back to the default
export function parseListingParams(raw: RawSearchParams): ListingState {
  const sort = first(raw.sort)
  const page = first(raw.page)
  const pageNumber = page && /^[1-9]\d*$/.test(page) ? Number(page) : 1

  return {
    sort: isSort(sort) ? sort : DEFAULT_SORT,
    page: Number.isSafeInteger(pageNumber) ? pageNumber : 1,
  }
}

// "sort=price-desc&page=2": defaults omitted, keys in a fixed order, "" when
// everything is the default
export function listingQuery(state: ListingState): string {
  const params = new URLSearchParams()
  if (state.sort !== DEFAULT_SORT) params.set("sort", state.sort)
  if (state.page !== 1) params.set("page", String(state.page))
  return params.toString()
}

export function listingHref(slug: string, state: ListingState): string {
  const query = listingQuery(state)
  return query ? `${categoryHref(slug)}?${query}` : categoryHref(slug)
}

// True when the request's query is exactly the state's canonical one. Anything
// else (bad values, defaults spelled out, unknown keys) gets redirected.
export function isCanonicalQuery(
  raw: RawSearchParams,
  state: ListingState
): boolean {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(raw)) {
    for (const item of [value ?? []].flat()) params.append(key, item)
  }
  return params.toString() === listingQuery(state)
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
