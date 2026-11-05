import "server-only"

import { db } from "@/lib/db"

import {
  type AddressView,
  addressView,
  type ContactView,
  contactView,
} from "../mask"
import { type AdminRole, can } from "../permissions"
import { assertCan, type Denied, denied } from "./guard"

// Orders as Admin shows them, with customer fields masked for Demo
// (docs/specs/040-admin-permissions-audit-masking, Behavior 13-16). The only
// way an admin page reads an order's contact or address.

const orderPersonSelect = {
  orderNumber: true,
  status: true,
  fulfillment: true,
  paymentOption: true,
  total: true,
  createdAt: true,
  guestEmail: true,
  contactName: true,
  contactMobile: true,
  regionName: true,
  zone: true,
  provinceName: true,
  cityName: true,
  barangayName: true,
  street: true,
  zip: true,
} as const

export type OrderPersonView = {
  orderNumber: string
  status: string
  fulfillment: "DELIVERY" | "PICKUP"
  paymentOption: string
  total: number
  createdAt: Date
  contact: ContactView
  address: AddressView
}

type Row = Omit<OrderPersonView, "contact" | "address"> & {
  guestEmail: string
  contactName: string
  contactMobile: string
  regionName: string | null
  zone: string | null
  provinceName: string | null
  cityName: string | null
  barangayName: string | null
  street: string | null
  zip: string | null
}

function toView(role: AdminRole, row: Row): OrderPersonView {
  return {
    orderNumber: row.orderNumber,
    status: row.status,
    fulfillment: row.fulfillment,
    paymentOption: row.paymentOption,
    total: row.total,
    createdAt: row.createdAt,
    contact: contactView(role, row),
    address: addressView(role, row),
  }
}

export async function getOrderPerson(
  role: AdminRole,
  orderNumber: string
): Promise<OrderPersonView | null> {
  assertCan(role, "orders.view")
  const row = await db.order.findUnique({
    where: { orderNumber },
    select: orderPersonSelect,
  })
  return row ? toView(role, row) : null
}

export type OrderSearch = {
  // Part of an order number: not customer data
  orderNumber?: string
  // A name, email or mobile: customer data
  customer?: string
}

const SEARCH_LIMIT = 50

// A customer term as Demo is refused before any query runs (the search would
// reveal who is a customer behind the masking)
export async function searchOrders(
  role: AdminRole,
  search: OrderSearch
): Promise<{ ok: true; orders: OrderPersonView[] } | Denied> {
  assertCan(role, "orders.view")
  const customer = search.customer?.trim()
  if (customer && !can(role, "orders.search-customer")) {
    return denied(role, "orders.search-customer")
  }
  const number = search.orderNumber?.trim()
  const rows = await db.order.findMany({
    where: {
      ...(number
        ? { orderNumber: { contains: number, mode: "insensitive" } }
        : {}),
      ...(customer
        ? {
            OR: [
              { guestEmail: { contains: customer, mode: "insensitive" } },
              { contactName: { contains: customer, mode: "insensitive" } },
              { contactMobile: { contains: customer } },
            ],
          }
        : {}),
    },
    select: orderPersonSelect,
    orderBy: { createdAt: "desc" },
    take: SEARCH_LIMIT,
  })
  return { ok: true, orders: rows.map((row) => toView(role, row)) }
}
