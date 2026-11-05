import "server-only"

import type { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import { dueOrderCondition } from "@/lib/orders/due-sql"
import type {
  FulfillmentName,
  OrderStatusName,
  PaymentOptionName,
} from "@/lib/orders/timeline"

import {
  type AddressView,
  addressView,
  type ContactView,
  contactView,
  type Masked,
  maskName,
} from "../mask"
import {
  customerQueryOf,
  hasCustomerTerm,
  ORDERS_PAGE_SIZE,
  type OrderParams,
  pageCount,
  resolvePage,
} from "../orders-params"
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

// ---- The list (docs/specs/041-admin-orders-list-detail) ----

// A Demo view has no field that can hold the real name (spec 040, R15)
export type CustomerName =
  { masked: false; name: string } | { masked: true; name: Masked }

export type OrderListRow = {
  orderNumber: string
  createdAt: Date
  // The row's true status (D2); the shopper's page reads past-deadline orders
  // as Cancelled, Admin doesn't
  status: OrderStatusName
  // Pending, past its deadline, and no payment problem: the release job's own
  // rule (lib/orders/due-sql.ts), shown as a badge
  dueForRelease: boolean
  fulfillment: FulfillmentName
  paymentOption: PaymentOptionName
  paymentMethod: string | null
  total: number
  customer: CustomerName
  flags: { refundRequired: boolean; needsCheck: boolean }
}

export type OrderList = {
  ok: true
  rows: OrderListRow[]
  total: number
  // The page actually read: a request past the last page lands on the last,
  // and the caller redirects when it differs from what was asked
  page: number
  pageCount: number
}

const listSelect = {
  id: true,
  orderNumber: true,
  createdAt: true,
  status: true,
  fulfillment: true,
  paymentOption: true,
  paymentMethod: true,
  total: true,
  contactName: true,
  refundRequired: true,
  payments: {
    where: { problem: "AMOUNT_MISMATCH" },
    select: { id: true },
    take: 1,
  },
} as const satisfies Prisma.OrderSelect

function whereOf(params: OrderParams): Prisma.OrderWhereInput {
  const customer = customerQueryOf(params.customer)
  const and: Prisma.OrderWhereInput[] = []
  if (params.status) and.push({ status: params.status })
  if (params.payment) {
    and.push({ paymentOption: params.payment === "cod" ? "COD" : "ONLINE" })
  }
  if (params.number) {
    and.push({ orderNumber: { contains: params.number, mode: "insensitive" } })
  }
  if (customer) {
    and.push({
      OR: [
        { contactName: { contains: customer.text, mode: "insensitive" } },
        { guestEmail: { contains: customer.text, mode: "insensitive" } },
        ...(customer.mobileDigits
          ? [{ contactMobile: { contains: customer.mobileDigits } }]
          : []),
      ],
    })
  }
  return and.length > 0 ? { AND: and } : {}
}

// The ids among these that the release job would release now
async function dueAmong(ids: string[], now: Date): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const due = await db.$queryRaw<{ id: string }[]>`
    SELECT o."id" FROM "Order" o
    WHERE o."id" = ANY(${ids}::text[]) AND ${dueOrderCondition(now)}`
  return new Set(due.map(({ id }) => id))
}

// A customer term as Demo is refused before any query runs (R6): searching
// would confirm who is a customer behind the masking
export async function listOrders(
  role: AdminRole,
  params: OrderParams,
  now: Date
): Promise<OrderList | Denied> {
  assertCan(role, "orders.view")
  if (
    hasCustomerTerm(params.customer) &&
    !can(role, "orders.search-customer")
  ) {
    return denied(role, "orders.search-customer")
  }
  const where = whereOf(params)
  const total = await db.order.count({ where })
  const page = resolvePage(params.page, total)
  const rows = await db.order.findMany({
    where,
    select: listSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * ORDERS_PAGE_SIZE,
    take: ORDERS_PAGE_SIZE,
  })
  const due = await dueAmong(
    rows.map(({ id }) => id),
    now
  )
  return {
    ok: true,
    total,
    page,
    pageCount: pageCount(total),
    rows: rows.map((row) => ({
      orderNumber: row.orderNumber,
      createdAt: row.createdAt,
      status: row.status,
      dueForRelease: due.has(row.id),
      fulfillment: row.fulfillment,
      paymentOption: row.paymentOption,
      paymentMethod: row.paymentMethod,
      total: row.total,
      customer:
        role === "demo"
          ? { masked: true, name: maskName(row.contactName) }
          : { masked: false, name: row.contactName },
      flags: {
        refundRequired: row.refundRequired,
        needsCheck: row.payments.length > 0,
      },
    })),
  }
}
