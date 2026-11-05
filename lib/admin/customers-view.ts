import { ADMIN_COPY } from "./copy"
import { DEFAULT_ORDER_PARAMS, orderParamsHref } from "./orders-params"

// Pure rules of the Customers screen and the link into the order list
// (docs/specs/042-admin-customers, B7, B12, R7, R8).

// A Demo customer has a rank key, never the email: "c1" is the customer with
// the most recent last order, "c26" the first on page 2. Rank across the whole
// list, not the position within a page.
export const rankKey = (rank: number): string => `c${rank}`

// The rank a Demo key names, or null for anything else (R8): "c0", "C1",
// "c01", an email and text are not keys, so no lookup runs for them
export function demoKeyRank(key: string): number | null {
  const match = /^c([1-9]\d{0,6})$/.exec(key)
  return match ? Number(match[1]) : null
}

// "View orders": the order list filtered to one customer
export const buyerHref = (key: string): string =>
  orderParamsHref({ ...DEFAULT_ORDER_PARAMS, buyer: key })

// The line above a customer's orders; null name = no such customer
export const buyerLine = (name: string | null): string =>
  name === null
    ? ADMIN_COPY.orders.buyer.unknown
    : ADMIN_COPY.orders.buyer.line(name)
