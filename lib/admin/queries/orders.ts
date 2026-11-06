import "server-only"

import type { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import { dueOrderCondition } from "@/lib/orders/due-sql"
import type { CancelReasonName } from "@/lib/orders/cancel"
import { orderNumberShape } from "@/lib/orders/number"
import type {
  FulfillmentName,
  OrderStatusName,
  PaymentOptionName,
} from "@/lib/orders/timeline"
import type { OrderPageItem } from "@/lib/orders/view"

import {
  type AddressView,
  addressView,
  type ContactView,
  contactView,
  type Masked,
  maskMobile,
  maskName,
  type ParcelView,
  parcelView,
} from "../mask"
import type {
  EmailStatusName,
  EmailTypeName,
  PaymentProblemName,
  PaymentStatusName,
} from "../orders-view"
import {
  customerQueryOf,
  hasCustomerTerm,
  ORDERS_PAGE_SIZE,
  type OrderParams,
  pageCount,
  resolvePage,
} from "../orders-params"
import { type AdminRole, can } from "../permissions"
import { customerLinkKey, findBuyerOrders } from "./customers"
import { assertCan, type Denied, denied } from "./guard"

// Orders as Admin shows them, with customer fields masked for Demo
// (docs/specs/040-admin-permissions-audit-masking, Behavior 13-16). The only
// way an admin page reads an order's contact or address. Every query selects
// named fields and never spreads a row: the token hash, idempotency key, cart
// hash, webhook payloads and recipient hashes are not selected anywhere
// (docs/specs/041-admin-orders-list-detail, R11).

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
  // The customer the list is filtered to (docs/specs/042-admin-customers,
  // B11, B12): their name (masked for Demo), "unknown" for a key that names
  // nobody, null when there is no buyer filter
  buyer: CustomerName | "unknown" | null
}

export const listSelect = {
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

export type ListSelectRow = Prisma.OrderGetPayload<{
  select: typeof listSelect
}>

// One list row as the viewer may see it: Demo's customer name is masked here,
// so the row has no field that can hold the real one
export function toOrderListRow(
  role: AdminRole,
  row: ListSelectRow,
  dueForRelease: boolean
): OrderListRow {
  return {
    orderNumber: row.orderNumber,
    createdAt: row.createdAt,
    status: row.status,
    dueForRelease,
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
  }
}

function whereOf(
  params: OrderParams,
  buyerOrderIds: string[] | null
): Prisma.OrderWhereInput {
  const customer = customerQueryOf(params.customer)
  const and: Prisma.OrderWhereInput[] = []
  if (params.status) and.push({ status: params.status })
  if (params.payment) {
    and.push({ paymentOption: params.payment === "cod" ? "COD" : "ONLINE" })
  }
  if (buyerOrderIds) and.push({ id: { in: buyerOrderIds } })
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
export async function dueAmong(ids: string[], now: Date): Promise<Set<string>> {
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
  // The buyer's order ids come from one raw query on the shared customer key;
  // the rest of the list is the typed query below (docs/specs/042, R5a)
  const buyer = params.buyer ? await findBuyerOrders(role, params.buyer) : null
  const where = whereOf(params, buyer ? buyer.orderIds : null)
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
    buyer: buyer ? (buyer.name ?? "unknown") : null,
    rows: rows.map((row) => toOrderListRow(role, row, due.has(row.id))),
  }
}

// ---- The detail ----

export type PaymentAttempt = {
  referenceId: string
  provider: "XENDIT" | "FAKE"
  status: PaymentStatusName
  // Centavos
  amount: number
  // GCASH, PAYMAYA, CARDS (FAKE in tests), once paid
  method: string | null
  // The gateway's ids, to find the payment in its dashboard (D8)
  sessionId: string | null
  gatewayPaymentId: string | null
  createdAt: Date
  paidAt: Date | null
  sessionExpiresAt: Date
  problem: PaymentProblemName | null
  // What the gateway received when it isn't the order's amount
  receivedAmount: number | null
}

export type EmailRecord = {
  type: EmailTypeName
  status: EmailStatusName
  attempts: number
  // A short code, never a message
  lastErrorCode: string | null
  sentAt: Date | null
  createdAt: Date
}

export type OrderDetail = {
  orderNumber: string
  status: OrderStatusName
  dueForRelease: boolean
  flags: { refundRequired: boolean; needsCheck: boolean }
  fulfillment: FulfillmentName
  paymentOption: PaymentOptionName
  paymentMethod: string | null
  createdAt: Date
  expiresAt: Date
  paidAt: Date | null
  confirmedAt: Date | null
  cancelledAt: Date | null
  cancelReason: CancelReasonName | null
  // The fulfillment moves (docs/specs/043-order-fulfillment-transitions);
  // completedAt is Delivered or Picked up, labeled from the fulfillment
  processingAt: Date | null
  shippedAt: Date | null
  readyAt: Date | null
  completedAt: Date | null
  // Demo's tracking number is masked to its last four (R6a)
  parcel: ParcelView | null
  contact: ContactView
  // The key of "View this customer's orders" (docs/specs/042-admin-customers,
  // B15): the normalized email for Owner and Staff, the customer's rank key
  // for Demo, never the email; null when the role can't open Customers
  customerKey: string | null
  address: AddressView
  zone: string | null
  weightGrams: number
  // In the order's position order; names and prices are the snapshots
  items: OrderPageItem[]
  subtotal: number
  shippingFee: number
  discount: number
  voucherCode: string | null
  total: number
  // Newest first, every attempt including ones that never opened a session
  payments: PaymentAttempt[]
  // Oldest first
  emails: EmailRecord[]
}

const detailSelect = {
  id: true,
  orderNumber: true,
  status: true,
  fulfillment: true,
  paymentOption: true,
  paymentMethod: true,
  createdAt: true,
  expiresAt: true,
  paidAt: true,
  confirmedAt: true,
  cancelledAt: true,
  cancelReason: true,
  processingAt: true,
  shippedAt: true,
  readyAt: true,
  completedAt: true,
  courier: true,
  trackingNumber: true,
  refundRequired: true,
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
  weightGrams: true,
  subtotal: true,
  shippingFee: true,
  discount: true,
  voucherCode: true,
  total: true,
  items: {
    orderBy: { position: "asc" },
    select: {
      nameSnapshot: true,
      priceSnapshot: true,
      quantity: true,
      buildId: true,
      slot: true,
    },
  },
  payments: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      referenceId: true,
      provider: true,
      status: true,
      amount: true,
      method: true,
      providerRef: true,
      gatewayPaymentId: true,
      createdAt: true,
      paidAt: true,
      expiresAt: true,
      problem: true,
      receivedAmount: true,
    },
  },
  emails: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      type: true,
      status: true,
      attempts: true,
      lastErrorCode: true,
      sentAt: true,
      createdAt: true,
    },
  },
} as const satisfies Prisma.OrderSelect

// A malformed number is null with no database read; an unknown one is null
export async function getOrderDetail(
  role: AdminRole,
  orderNumber: string,
  now: Date
): Promise<OrderDetail | null> {
  assertCan(role, "orders.view")
  if (!orderNumberShape(orderNumber)) return null
  const row = await db.order.findUnique({
    where: { orderNumber },
    select: detailSelect,
  })
  if (!row) return null
  const due = await dueAmong([row.id], now)
  return {
    orderNumber: row.orderNumber,
    status: row.status,
    dueForRelease: due.has(row.id),
    flags: {
      refundRequired: row.refundRequired,
      needsCheck: row.payments.some((p) => p.problem === "AMOUNT_MISMATCH"),
    },
    fulfillment: row.fulfillment,
    paymentOption: row.paymentOption,
    paymentMethod: row.paymentMethod,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    paidAt: row.paidAt,
    confirmedAt: row.confirmedAt,
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason,
    processingAt: row.processingAt,
    shippedAt: row.shippedAt,
    readyAt: row.readyAt,
    completedAt: row.completedAt,
    parcel: parcelView(role, row),
    contact: contactView(role, row),
    customerKey: await customerLinkKey(role, row.guestEmail),
    address: addressView(role, row),
    zone: row.zone,
    weightGrams: row.weightGrams,
    items: row.items.map((item) => ({
      name: item.nameSnapshot,
      unitPrice: item.priceSnapshot,
      quantity: item.quantity,
      buildId: item.buildId,
      slot: item.slot,
    })),
    subtotal: row.subtotal,
    shippingFee: row.shippingFee,
    discount: row.discount,
    voucherCode: row.voucherCode,
    total: row.total,
    payments: row.payments.map((p) => ({
      referenceId: p.referenceId,
      provider: p.provider,
      status: p.status,
      amount: p.amount,
      method: p.method,
      sessionId: p.providerRef,
      gatewayPaymentId: p.gatewayPaymentId,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
      sessionExpiresAt: p.expiresAt,
      problem: p.problem,
      receivedAmount: p.receivedAmount,
    })),
    emails: row.emails,
  }
}

// ---- The packing slip ----

// The courier needs the name and the mobile number, and the address; the
// email is not on a slip and is not even read. No price field exists on this
// type at all (docs/specs/041-admin-orders-list-detail, R12).
export type SlipContact =
  | { masked: false; name: string; mobile: string }
  | { masked: true; name: Masked; mobile: Masked }

export type PackingSlip = {
  orderNumber: string
  createdAt: Date
  status: OrderStatusName
  fulfillment: FulfillmentName
  paymentOption: PaymentOptionName
  paidAt: Date | null
  // Once shipped; the tracking number is masked for Demo
  parcel: ParcelView | null
  contact: SlipContact
  address: AddressView
  weightGrams: number
  items: SlipItem[]
}

export type SlipItem = {
  name: string
  quantity: number
  buildId: string | null
  slot: string | null
}

const slipSelect = {
  orderNumber: true,
  createdAt: true,
  status: true,
  fulfillment: true,
  paymentOption: true,
  paidAt: true,
  courier: true,
  trackingNumber: true,
  contactName: true,
  contactMobile: true,
  regionName: true,
  zone: true,
  provinceName: true,
  cityName: true,
  barangayName: true,
  street: true,
  zip: true,
  weightGrams: true,
  items: {
    orderBy: { position: "asc" },
    select: {
      nameSnapshot: true,
      quantity: true,
      buildId: true,
      slot: true,
    },
  },
} as const satisfies Prisma.OrderSelect

// A malformed number is null with no database read; an unknown one is null
export async function getPackingSlip(
  role: AdminRole,
  orderNumber: string
): Promise<PackingSlip | null> {
  assertCan(role, "orders.packing-slip")
  if (!orderNumberShape(orderNumber)) return null
  const row = await db.order.findUnique({
    where: { orderNumber },
    select: slipSelect,
  })
  if (!row) return null
  return {
    orderNumber: row.orderNumber,
    createdAt: row.createdAt,
    status: row.status,
    fulfillment: row.fulfillment,
    paymentOption: row.paymentOption,
    paidAt: row.paidAt,
    parcel: parcelView(role, row),
    contact:
      role === "demo"
        ? {
            masked: true,
            name: maskName(row.contactName),
            mobile: maskMobile(row.contactMobile),
          }
        : {
            masked: false,
            name: row.contactName,
            mobile: row.contactMobile,
          },
    address: addressView(role, row),
    weightGrams: row.weightGrams,
    items: row.items.map((item) => ({
      name: item.nameSnapshot,
      quantity: item.quantity,
      buildId: item.buildId,
      slot: item.slot,
    })),
  }
}
