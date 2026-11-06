import { first } from "@/lib/listing-filters/raw"
import type { RawSearchParams } from "@/lib/listing-filters/types"
import { builderCategories, type BuilderCategorySlug } from "@/lib/specs"

// URL state of the Admin product list (docs/specs/045-admin-products-create-
// edit, B5, E3, E4), parsed and written only here, with the same rules as the
// order and customer lists: a bad value is the default and a URL that isn't
// the canonical one redirects. Pure.

export const PRODUCTS_PATH = "/admin/products"
export const PRODUCTS_PAGE_SIZE = 25
export const SEARCH_MIN = 2
export const SEARCH_MAX = 100

export const PRODUCT_STATUS_FILTERS = ["draft", "active"] as const
export type ProductStatusFilter = (typeof PRODUCT_STATUS_FILTERS)[number]

export type ProductParams = {
  // Searched only from SEARCH_MIN characters; shorter text is dropped
  q: string
  category: BuilderCategorySlug | null
  status: ProductStatusFilter | null
  page: number
}

export const DEFAULT_PRODUCT_PARAMS: ProductParams = {
  q: "",
  category: null,
  status: null,
  page: 1,
}

export const CATEGORY_SLUGS = Object.keys(
  builderCategories
) as BuilderCategorySlug[]

function parsePage(value: string | undefined): number {
  return value !== undefined && /^[1-9]\d{0,6}$/.test(value) ? Number(value) : 1
}

export function parseProductParams(raw: RawSearchParams): ProductParams {
  const q = (first(raw.q) ?? "").trim().slice(0, SEARCH_MAX)
  const category = first(raw.category)
  const status = first(raw.status)
  return {
    q: q.length >= SEARCH_MIN ? q : "",
    category: CATEGORY_SLUGS.find((slug) => slug === category) ?? null,
    status: PRODUCT_STATUS_FILTERS.find((s) => s === status) ?? null,
    page: parsePage(first(raw.page)),
  }
}

export function serializeProductParams(
  params: ProductParams
): [string, string][] {
  const entries: [string, string][] = []
  if (params.q) entries.push(["q", params.q])
  if (params.category) entries.push(["category", params.category])
  if (params.status) entries.push(["status", params.status])
  if (params.page > 1) entries.push(["page", String(params.page)])
  return entries
}

export function productParamsHref(params: ProductParams): string {
  const query = new URLSearchParams(serializeProductParams(params)).toString()
  return query ? `${PRODUCTS_PATH}?${query}` : PRODUCTS_PATH
}

export function isCanonicalProductQuery(
  raw: RawSearchParams,
  params: ProductParams
): boolean {
  const given = Object.entries(raw).filter(([, v]) => v !== undefined)
  const wanted = serializeProductParams(params)
  if (given.length !== wanted.length) return false
  return wanted.every(([key, value]) => raw[key] === value)
}

export const hasActiveProductFilters = (params: ProductParams): boolean =>
  params.q !== "" || params.category !== null || params.status !== null

export function productPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PRODUCTS_PAGE_SIZE))
}

// A page past the last goes to the last; no match at all is page 1
export function resolveProductPage(requested: number, total: number): number {
  if (total === 0) return 1
  return Math.min(requested, productPageCount(total))
}
