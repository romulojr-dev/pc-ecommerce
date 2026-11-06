import "server-only"

import type { EmailType } from "@/generated/prisma/client"
import { SLOT_COPY } from "@/lib/build-state/slots"
import type { Slot } from "@/lib/builder"
import { groupName } from "@/lib/cart/copy"
import { addressLines, shippingValue } from "@/lib/checkout/copy"
import { formatPeso } from "@/lib/format"
import { absoluteUrl } from "@/lib/seo/urls"
import { confirmPayLine, discountLabel } from "@/lib/orders/copy"
import { nothingReceived } from "@/lib/orders/cancel"
import { displayStatus } from "@/lib/orders/display-status"
import { dateTimeText, isPastDue, payByText } from "@/lib/orders/time"
import { statusLabel } from "@/lib/orders/timeline"
import { orderEntries, type OrderPageItem } from "@/lib/orders/view"
import { paidLine } from "@/lib/payments/copy"

import {
  amountPaid,
  cancelledLead,
  cancelledSubject,
  codConfirmLead,
  codConfirmSubject,
  confirmByLine,
  EMAIL_COPY,
  greeting,
  placedLead,
  placedSubject,
  receivedLead,
  receivedSubject,
  statusLine,
} from "./copy"
import {
  cashReadyLine,
  courierLine,
  deliveredAtLine,
  deliveredLead,
  deliveredSubject,
  readyAtLine,
  readyLead,
  readySubject,
  shippedAtLine,
  shippedLead,
  shippedSubject,
  trackingLine,
} from "./fulfillment-copy"
import type { EmailContext } from "./templates"

// What an email says, as plain data (docs/specs/036-order-emails, §6 Pure
// view-model). Built from the order row, the store's settings and the time,
// and drawn twice, as HTML and as plain text, from the same tree, so the two
// can't disagree. Nothing here reads the database or the environment.

export type EmailLine = {
  name: string
  // The slot's name, for a part of a build
  slot: string | null
  // "₱11,495.00 × 2"
  unit: string
  total: string
}

export type EmailEntry =
  | { kind: "single"; line: EmailLine }
  | { kind: "build"; name: string; total: string; parts: EmailLine[] }

export type EmailWhere =
  | { kind: "delivery"; heading: string; lines: [string, string] }
  | {
      kind: "pickup"
      heading: string
      address: string
      hours: string
      note: string
    }

export type EmailLink = { label: string; href: string }

export type EmailView = {
  subject: string
  greeting: string | null
  lead: string
  // Lines under the lead: when to pay by, the amount, when it was paid
  details: string[]
  // The status of an order that can no longer be paid
  statusLine: string | null
  // The primary button
  action: EmailLink | null
  // Text links
  links: EmailLink[]
  entries: EmailEntry[] | null
  totals: { label: string; value: string; strong: boolean }[] | null
  where: EmailWhere | null
  linkNote: string | null
  testNote: string
  footer: string
}

export const EMAIL_VIEW_TYPES: readonly EmailType[] = [
  "ORDER_PLACED",
  "PAYMENT_RECEIVED",
  "ORDER_CANCELLED",
  "ORDER_CANCELLED_BY_STORE",
  "COD_CONFIRM",
  "ORDER_SHIPPED",
  "READY_FOR_PICKUP",
  "ORDER_DELIVERED",
]

const slotLabel = (slot: string | null): string | null =>
  slot === null ? null : (SLOT_COPY[slot as Slot]?.name ?? slot)

function toLine(item: OrderPageItem, part: boolean): EmailLine {
  return {
    name: item.name,
    slot: part ? slotLabel(item.slot) : null,
    unit: `${formatPeso(item.unitPrice)} × ${item.quantity}`,
    total: formatPeso(item.unitPrice * item.quantity),
  }
}

function entriesOf(items: readonly OrderPageItem[]): EmailEntry[] {
  return orderEntries(items).map((entry): EmailEntry => {
    if (entry.kind === "single") {
      return { kind: "single", line: toLine(entry.item, false) }
    }
    return {
      kind: "build",
      name: groupName(entry.number),
      total: formatPeso(entry.total),
      parts: entry.parts.map((part) => toLine(part, true)),
    }
  })
}

export type EmailViewInput = Pick<
  EmailContext,
  "order" | "store" | "now" | "viewUrl" | "confirmUrl" | "siteUrl"
>

const common = {
  testNote: EMAIL_COPY.testNote,
  footer: EMAIL_COPY.footer,
}

// What the order was: its lines, totals and where it goes, drawn from the
// order's snapshots. The same for "Order placed" and the cash confirmation.
function orderBody(
  order: EmailViewInput["order"],
  store: EmailViewInput["store"]
): Pick<EmailView, "entries" | "totals" | "where"> {
  const items: OrderPageItem[] = order.items.map((item) => ({
    name: item.nameSnapshot,
    unitPrice: item.priceSnapshot,
    quantity: item.quantity,
    buildId: item.buildId,
    slot: item.slot,
  }))

  let where: EmailWhere
  if (order.fulfillment === "PICKUP") {
    if (!store) throw new Error("A pickup order needs the store's settings")
    where = {
      kind: "pickup",
      heading: EMAIL_COPY.pickupHeading,
      address: store.address,
      hours: store.hours,
      note: EMAIL_COPY.pickupNote,
    }
  } else {
    where = {
      kind: "delivery",
      heading: EMAIL_COPY.addressHeading,
      lines: addressLines({
        street: order.street ?? "",
        barangay: order.barangayName ?? "",
        city: order.cityName ?? "",
        province: order.provinceName ?? "",
        region: order.regionName ?? "",
        zip: order.zip ?? "",
      }),
    }
  }

  const totals = [
    { label: EMAIL_COPY.subtotal, value: formatPeso(order.subtotal) },
    {
      label: EMAIL_COPY.shipping,
      value: shippingValue({
        ok: true,
        fee: order.shippingFee,
        basis: order.fulfillment === "PICKUP" ? "pickup" : "rate",
      }),
    },
    ...(order.discount > 0
      ? [
          {
            label: order.voucherCode
              ? discountLabel(order.voucherCode)
              : EMAIL_COPY.discount,
            value: `−${formatPeso(order.discount)}`,
          },
        ]
      : []),
    { label: EMAIL_COPY.total, value: formatPeso(order.total) },
  ].map((row, index, all) => ({ ...row, strong: index === all.length - 1 }))

  return { entries: entriesOf(items), totals, where }
}

function placed({ order, store, now, viewUrl }: EmailViewInput): EmailView {
  // Payable only while the order is Pending payment and before its deadline;
  // an email sent late describes the order as it is now (D2)
  const payable =
    order.status === "PENDING_PAYMENT" && !isPastDue(order.expiresAt, now)

  return {
    subject: placedSubject(order.orderNumber),
    greeting: greeting(order.contactName),
    lead: placedLead(order.orderNumber),
    details: payable
      ? [`${payByText(order.expiresAt)}. ${EMAIL_COPY.unpaidNote}`]
      : [],
    statusLine: payable ? null : statusLine(statusLabel(order.status)),
    action: payable ? { label: EMAIL_COPY.payNow, href: viewUrl } : null,
    links: [{ label: EMAIL_COPY.viewOrder, href: viewUrl }],
    ...orderBody(order, store),
    linkNote: EMAIL_COPY.linkNote,
    ...common,
  }
}

// The cash order's confirmation (docs/specs/038-cash-on-delivery, Behavior
// 15). Like every email it describes the order as it is when sent: the
// button shows only while the order is Pending confirmation and before its
// deadline, otherwise a status line says where it stands.
function codConfirm({
  order,
  store,
  now,
  viewUrl,
  confirmUrl,
}: EmailViewInput): EmailView {
  const pickup = order.fulfillment === "PICKUP"
  const confirmable =
    order.status === "PENDING_CONFIRMATION" && !isPastDue(order.expiresAt, now)
  // A confirmable order with no link is a bug in the caller, not a state to
  // print around
  if (confirmable && !confirmUrl) {
    throw new Error("A cash order's confirmation needs its confirm link")
  }

  return {
    subject: codConfirmSubject(order.orderNumber, pickup),
    greeting: greeting(order.contactName),
    lead: codConfirmLead(order.orderNumber, pickup),
    details: confirmable
      ? [
          confirmByLine(dateTimeText(order.expiresAt)),
          confirmPayLine(order.total, pickup),
        ]
      : [],
    statusLine: confirmable
      ? null
      : statusLine(statusLabel(displayStatus(order, now))),
    action:
      confirmable && confirmUrl
        ? { label: EMAIL_COPY.confirmOrder, href: confirmUrl }
        : null,
    links: [{ label: EMAIL_COPY.viewOrder, href: viewUrl }],
    ...orderBody(order, store),
    linkNote: EMAIL_COPY.linkNote,
    ...common,
  }
}

function received({ order, viewUrl }: EmailViewInput): EmailView {
  // Only an order that became Paid has a payment email; a missing time is a
  // bug, not a state to print around (T12)
  if (order.paidAt === null) {
    throw new Error("A payment email needs the order's paidAt")
  }
  return {
    subject: receivedSubject(order.orderNumber),
    greeting: greeting(order.contactName),
    lead: receivedLead(order.orderNumber),
    // The order's total is the amount: a payment is applied only when the
    // session, the payment and the order agree (D5)
    details: [
      amountPaid(formatPeso(order.total)),
      paidLine(order.paidAt, order.paymentMethod),
    ],
    statusLine: null,
    action: { label: EMAIL_COPY.viewOrder, href: viewUrl },
    links: [],
    entries: null,
    totals: null,
    where: null,
    linkNote: EMAIL_COPY.linkNote,
    ...common,
  }
}

function cancelled({ order, siteUrl }: EmailViewInput): EmailView {
  return {
    subject: cancelledSubject(order.orderNumber),
    greeting: greeting(order.contactName),
    lead: cancelledLead(
      order.orderNumber,
      order.cancelReason,
      order.paymentOption,
      !nothingReceived({ paidAt: order.paidAt, payments: order.payments })
    ),
    details: [],
    statusLine: null,
    action: null,
    // The shop's home page; a cancelled order has nothing left to open (D6)
    links: [{ label: EMAIL_COPY.visitShop, href: absoluteUrl(siteUrl, "/") }],
    entries: null,
    totals: null,
    where: null,
    linkNote: null,
    ...common,
  }
}

// The three fulfillment emails (docs/specs/043-order-fulfillment-transitions,
// B18, R14). Each states a fact that already happened, with its stored time;
// a missing time or parcel detail is a bug in the caller, not a state to print
// around. Built from the order as it is when sent, so only a Cancelled or
// Refunded order adds a status line: it is no longer going ahead.
function afterwards(order: EmailViewInput["order"]): string | null {
  return order.status === "CANCELLED" || order.status === "REFUNDED"
    ? statusLine(statusLabel(order.status))
    : null
}

function parcelOf(order: EmailViewInput["order"]) {
  if (!order.courier || !order.trackingNumber) {
    throw new Error("A shipping email needs the order's courier and tracking")
  }
  return { courier: order.courier, trackingNumber: order.trackingNumber }
}

function shipped({ order, store, viewUrl }: EmailViewInput): EmailView {
  if (order.shippedAt === null) {
    throw new Error("A shipped email needs the order's shippedAt")
  }
  const { courier, trackingNumber } = parcelOf(order)
  const body = orderBody(order, store)
  return {
    subject: shippedSubject(order.orderNumber),
    greeting: greeting(order.contactName),
    lead: shippedLead(order.orderNumber),
    details: [
      courierLine(courier),
      trackingLine(trackingNumber),
      shippedAtLine(dateTimeText(order.shippedAt)),
      ...(order.paymentOption === "COD"
        ? [cashReadyLine(formatPeso(order.total), false)]
        : []),
    ],
    statusLine: afterwards(order),
    action: { label: EMAIL_COPY.viewOrder, href: viewUrl },
    links: [],
    entries: body.entries,
    totals: null,
    where: body.where,
    linkNote: EMAIL_COPY.linkNote,
    ...common,
  }
}

function ready({ order, store, viewUrl }: EmailViewInput): EmailView {
  if (order.readyAt === null) {
    throw new Error("A ready-for-pickup email needs the order's readyAt")
  }
  const body = orderBody(order, store)
  return {
    subject: readySubject(order.orderNumber),
    greeting: greeting(order.contactName),
    lead: readyLead(order.orderNumber),
    details: [
      readyAtLine(dateTimeText(order.readyAt)),
      ...(order.paymentOption === "COD"
        ? [cashReadyLine(formatPeso(order.total), true)]
        : []),
    ],
    statusLine: afterwards(order),
    action: { label: EMAIL_COPY.viewOrder, href: viewUrl },
    links: [],
    entries: body.entries,
    totals: null,
    where: body.where,
    linkNote: EMAIL_COPY.linkNote,
    ...common,
  }
}

function delivered({ order, store, viewUrl }: EmailViewInput): EmailView {
  if (order.completedAt === null) {
    throw new Error("A delivered email needs the order's completedAt")
  }
  const { courier, trackingNumber } = parcelOf(order)
  return {
    subject: deliveredSubject(order.orderNumber),
    greeting: greeting(order.contactName),
    lead: deliveredLead(order.orderNumber),
    details: [
      deliveredAtLine(dateTimeText(order.completedAt)),
      courierLine(courier),
      trackingLine(trackingNumber),
    ],
    statusLine: afterwards(order),
    action: { label: EMAIL_COPY.viewOrder, href: viewUrl },
    links: [],
    entries: orderBody(order, store).entries,
    totals: null,
    where: null,
    linkNote: EMAIL_COPY.linkNote,
    ...common,
  }
}

export function emailView(type: EmailType, input: EmailViewInput): EmailView {
  switch (type) {
    case "ORDER_PLACED":
      return placed(input)
    case "PAYMENT_RECEIVED":
      return received(input)
    case "ORDER_CANCELLED":
    case "ORDER_CANCELLED_BY_STORE":
      return cancelled(input)
    case "COD_CONFIRM":
      return codConfirm(input)
    case "ORDER_SHIPPED":
      return shipped(input)
    case "READY_FOR_PICKUP":
      return ready(input)
    case "ORDER_DELIVERED":
      return delivered(input)
    default:
      throw new Error(`No email view for ${type}`)
  }
}
