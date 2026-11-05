import { first } from "@/lib/listing-filters/raw"
import type { RawSearchParams } from "@/lib/listing-filters/types"
import type { OrderStatusName } from "@/lib/orders/timeline"

// URL state of the Admin order list (docs/specs/041-admin-orders-list-detail,
// B5–B8, R2, R3, R6). Parsed and written only here, so each state has one URL.
// Pure: no database, so a client component could use it too.

export const ORDERS_PATH = "/admin/orders"
export const ORDERS_PAGE_SIZE = 25
export const SEARCH_TEXT_MAX = 100
export const CUSTOMER_MIN = 3

export const ORDER_STATUSES: readonly OrderStatusName[] = [
  "PENDING_PAYMENT",
  "PENDING_CONFIRMATION",
  "PAID",
  "COD_CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "READY_FOR_PICKUP",
  "DELIVERED",
  "PICKED_UP",
  "CANCELLED",
  "REFUNDED",
]

// Online (a gateway payment) or cash (on delivery, or on pickup). A channel
// filter is Phase 2 (D3, D13)
export const PAYMENT_FILTERS = ["online", "cod"] as const
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number]

export type OrderParams = {
  status: OrderStatusName | null
  payment: PaymentFilter | null
  // Part of an order number
  number: string
  // Name, email or mobile as typed; searched only from CUSTOMER_MIN characters
  customer: string
  // One customer's orders, by the key the Customers screen gives: the
  // normalized email for Owner and Staff, a rank key ("c3") for Demo
  // (docs/specs/042-admin-customers, B7, B11). Not a search: it is matched
  // exactly.
  buyer: string
  page: number
}

export const DEFAULT_ORDER_PARAMS: OrderParams = {
  status: null,
  payment: null,
  number: "",
  customer: "",
  buyer: "",
  page: 1,
}

const text = (value: string | string[] | undefined): string =>
  (first(value) ?? "").trim().slice(0, SEARCH_TEXT_MAX)

function parsePage(value: string | undefined): number {
  return value !== undefined && /^[1-9]\d{0,6}$/.test(value) ? Number(value) : 1
}

// Never throws: a bad value is the default (B8)
export function parseOrderParams(raw: RawSearchParams): OrderParams {
  const status = first(raw.status)
  const payment = first(raw.payment)
  return {
    status: ORDER_STATUSES.find((s) => s === status) ?? null,
    payment: PAYMENT_FILTERS.find((p) => p === payment) ?? null,
    number: text(raw.number),
    customer: text(raw.customer),
    buyer: text(raw.buyer),
    page: parsePage(first(raw.page)),
  }
}

// The canonical entries: defaults are left out
export function serializeOrderParams(params: OrderParams): [string, string][] {
  const entries: [string, string][] = []
  if (params.status) entries.push(["status", params.status])
  if (params.payment) entries.push(["payment", params.payment])
  if (params.number) entries.push(["number", params.number])
  if (params.customer) entries.push(["customer", params.customer])
  if (params.buyer) entries.push(["buyer", params.buyer])
  if (params.page > 1) entries.push(["page", String(params.page)])
  return entries
}

export function orderParamsHref(params: OrderParams): string {
  const query = new URLSearchParams(serializeOrderParams(params)).toString()
  return query ? `${ORDERS_PATH}?${query}` : ORDERS_PATH
}

// The list as it was left, carried to the detail as `back` so "Back to orders"
// returns to it (B11). The detail rebuilds the link from the parsed values
// only, so `back` can never name another place.
export function backQueryOf(params: OrderParams): string {
  return new URLSearchParams(serializeOrderParams(params)).toString()
}

export function backHrefOf(value: string | string[] | undefined): string {
  const query = first(value) ?? ""
  const raw: Record<string, string> = {}
  for (const [key, entry] of new URLSearchParams(query.slice(0, 500))) {
    if (!(key in raw)) raw[key] = entry
  }
  return orderParamsHref(parseOrderParams(raw))
}

// Whether the URL is already the canonical one: the same keys and values, each
// key once. Otherwise the page redirects to orderParamsHref (B8).
export function isCanonicalOrderQuery(
  raw: RawSearchParams,
  params: OrderParams
): boolean {
  const given = Object.entries(raw).filter(([, v]) => v !== undefined)
  const wanted = serializeOrderParams(params)
  if (given.length !== wanted.length) return false
  return wanted.every(([key, value]) => raw[key] === value)
}

// Any filter that narrows the list (the page doesn't count)
export const hasActiveFilters = (params: OrderParams): boolean =>
  params.status !== null ||
  params.payment !== null ||
  params.number !== "" ||
  params.customer !== "" ||
  params.buyer !== ""

// ---- Customer search (R6) ----

export type CustomerQuery = {
  // Matched, case-insensitively, inside the contact name and the email
  text: string
  // Matched inside the stored mobile's digits, when the term reads as a
  // phone number
  mobileDigits: string | null
}

// Only digits and phone punctuation read as a phone number
const PHONE_SHAPE = /^[\d\s+\-().]+$/

// "0917 123 4567", "+63 917 123 4567" and "9171234567" all give 9171234567:
// non-digits go, then one leading 63 or 0. Fewer than 3 digits left adds no
// mobile condition.
export function mobileDigitsOf(term: string): string | null {
  if (!PHONE_SHAPE.test(term)) return null
  let digits = term.replace(/\D/g, "")
  if (digits.startsWith("63")) digits = digits.slice(2)
  else if (digits.startsWith("0")) digits = digits.slice(1)
  return digits.length >= CUSTOMER_MIN ? digits : null
}

// null when the term is empty or too short to search (it is ignored)
export function customerQueryOf(customer: string): CustomerQuery | null {
  const term = customer.trim()
  if (term.length < CUSTOMER_MIN) return null
  return { text: term, mobileDigits: mobileDigitsOf(term) }
}

// A term was typed but is too short: the field says so (B7)
export const customerTooShort = (customer: string): boolean =>
  customer.trim() !== "" && customer.trim().length < CUSTOMER_MIN

// What Demo may not do, whatever the term's length (R6)
export const hasCustomerTerm = (customer: string): boolean =>
  customer.trim() !== ""

// ---- Paging ----

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE))
}

// Where the page should land for this many matches (B8): a page past the last
// goes to the last, except that no match at all is page 1 with the empty state
// and no redirect
export function resolvePage(requested: number, total: number): number {
  if (total === 0) return 1
  return Math.min(requested, pageCount(total))
}
