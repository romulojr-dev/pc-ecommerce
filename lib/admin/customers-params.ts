import { first } from "@/lib/listing-filters/raw"
import type { RawSearchParams } from "@/lib/listing-filters/types"

import { SEARCH_TEXT_MAX } from "./orders-params"

// URL state of the Admin customer list (docs/specs/042-admin-customers, B8,
// B10). Parsed and written only here. Pure: no database. The customer term's
// own rules (3 characters, mobile digits) are the order list's
// (`customerQueryOf` in orders-params).

export const CUSTOMERS_PATH = "/admin/customers"
export const CUSTOMERS_PAGE_SIZE = 25

export type CustomerParams = {
  // Name, email or mobile as typed
  customer: string
  page: number
}

export const DEFAULT_CUSTOMER_PARAMS: CustomerParams = {
  customer: "",
  page: 1,
}

const text = (value: string | string[] | undefined): string =>
  (first(value) ?? "").trim().slice(0, SEARCH_TEXT_MAX)

function parsePage(value: string | undefined): number {
  return value !== undefined && /^[1-9]\d{0,6}$/.test(value) ? Number(value) : 1
}

// Never throws: a bad value is the default
export function parseCustomerParams(raw: RawSearchParams): CustomerParams {
  return {
    customer: text(raw.customer),
    page: parsePage(first(raw.page)),
  }
}

// The canonical entries: defaults are left out
export function serializeCustomerParams(
  params: CustomerParams
): [string, string][] {
  const entries: [string, string][] = []
  if (params.customer) entries.push(["customer", params.customer])
  if (params.page > 1) entries.push(["page", String(params.page)])
  return entries
}

export function customersHref(params: CustomerParams): string {
  const query = new URLSearchParams(serializeCustomerParams(params)).toString()
  return query ? `${CUSTOMERS_PATH}?${query}` : CUSTOMERS_PATH
}

// Whether the URL is already the canonical one; otherwise the page redirects
export function isCanonicalCustomerQuery(
  raw: RawSearchParams,
  params: CustomerParams
): boolean {
  const given = Object.entries(raw).filter(([, v]) => v !== undefined)
  const wanted = serializeCustomerParams(params)
  if (given.length !== wanted.length) return false
  return wanted.every(([key, value]) => raw[key] === value)
}

export function customerPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE))
}

// A request past the last page lands on the last; no customers is page 1
export function resolveCustomerPage(requested: number, total: number): number {
  if (total === 0) return 1
  return Math.min(requested, customerPageCount(total))
}
