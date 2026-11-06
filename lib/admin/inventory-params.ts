import { first } from "@/lib/listing-filters/raw"
import type { RawSearchParams } from "@/lib/listing-filters/types"
import { builderCategories, type BuilderCategorySlug } from "@/lib/specs"

// URL state of the Admin inventory list and of a product's history page
// (docs/specs/046-admin-inventory-adjustments, B5, B14, E5, E28), parsed and
// written only here, with the same rules as the other Admin lists: a bad
// value is the default and a URL that isn't the canonical one redirects. Pure.

export const INVENTORY_PATH = "/admin/inventory"
export const INVENTORY_PAGE_SIZE = 25
export const HISTORY_PAGE_SIZE = 25
export const SEARCH_MIN = 2
export const SEARCH_MAX = 100

// low: 1..lowStockAt; out: 0; restock: both. Active products only (D4).
export const LEVEL_FILTERS = ["low", "out", "restock"] as const
export type LevelFilter = (typeof LEVEL_FILTERS)[number]

export type InventoryParams = {
  // Searched only from SEARCH_MIN characters; shorter text is dropped
  q: string
  category: BuilderCategorySlug | null
  level: LevelFilter | null
  page: number
}

export const DEFAULT_INVENTORY_PARAMS: InventoryParams = {
  q: "",
  category: null,
  level: null,
  page: 1,
}

export const CATEGORY_SLUGS = Object.keys(
  builderCategories
) as BuilderCategorySlug[]

function parsePage(value: string | undefined): number {
  return value !== undefined && /^[1-9]\d{0,6}$/.test(value) ? Number(value) : 1
}

export function parseInventoryParams(raw: RawSearchParams): InventoryParams {
  const q = (first(raw.q) ?? "").trim().slice(0, SEARCH_MAX)
  const category = first(raw.category)
  const level = first(raw.level)
  return {
    q: q.length >= SEARCH_MIN ? q : "",
    category: CATEGORY_SLUGS.find((slug) => slug === category) ?? null,
    level: LEVEL_FILTERS.find((l) => l === level) ?? null,
    page: parsePage(first(raw.page)),
  }
}

export function serializeInventoryParams(
  params: InventoryParams
): [string, string][] {
  const entries: [string, string][] = []
  if (params.q) entries.push(["q", params.q])
  if (params.category) entries.push(["category", params.category])
  if (params.level) entries.push(["level", params.level])
  if (params.page > 1) entries.push(["page", String(params.page)])
  return entries
}

export function inventoryHref(params: InventoryParams): string {
  const query = new URLSearchParams(serializeInventoryParams(params)).toString()
  return query ? `${INVENTORY_PATH}?${query}` : INVENTORY_PATH
}

function isCanonical(raw: RawSearchParams, wanted: [string, string][]) {
  const given = Object.entries(raw).filter(([, v]) => v !== undefined)
  if (given.length !== wanted.length) return false
  return wanted.every(([key, value]) => raw[key] === value)
}

export function isCanonicalInventoryQuery(
  raw: RawSearchParams,
  params: InventoryParams
): boolean {
  return isCanonical(raw, serializeInventoryParams(params))
}

export const hasActiveInventoryFilters = (params: InventoryParams): boolean =>
  params.q !== "" || params.category !== null || params.level !== null

export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

// A page past the last goes to the last; no match at all is page 1
export function resolvePage(
  requested: number,
  total: number,
  pageSize: number
): number {
  if (total === 0) return 1
  return Math.min(requested, pageCountOf(total, pageSize))
}

// ---- A product's history page: only ?page= ----

export function productInventoryHref(id: string, page = 1): string {
  const base = `${INVENTORY_PATH}/${encodeURIComponent(id)}`
  return page > 1 ? `${base}?page=${page}` : base
}

export function parseHistoryPage(raw: RawSearchParams): number {
  return parsePage(first(raw.page))
}

export function isCanonicalHistoryQuery(
  raw: RawSearchParams,
  page: number
): boolean {
  return isCanonical(raw, page > 1 ? [["page", String(page)]] : [])
}
