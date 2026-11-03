import { cache } from "react"

import { db } from "@/lib/db"
import { paymentsSummary } from "@/lib/payments/payment-view"

import { credentialShape, toCredential } from "./credential"
import { orderNumberShape } from "./number"
import { credentialOpens } from "./order-links"
import type { FulfillmentName, OrderStatusName } from "./timeline"
import type { OrderPageData } from "./view"

// Reads an order for its page (docs/specs/030-place-an-order, Behavior 17).
// The order is found by its number and opened with its credential: the access
// token or a signed `view` link (docs/specs/035-email-foundation-signed-
// links). A wrong credential, a missing one and an unknown number are all
// `null`, so the page can answer them with the same 404.
//
// A number or credential of the wrong shape is `null` without a database
// read. For a well-formed pair the cost is the same whether the order exists
// or not: one read and one constant-time comparison. A bare string is an
// access token.

export async function getOrderForPage(
  number: unknown,
  credential: unknown,
  now = new Date()
): Promise<OrderPageData | null> {
  const given = toCredential(credential)
  if (!orderNumberShape(number) || !credentialShape(given)) return null

  const order = await db.order.findUnique({
    where: { orderNumber: number },
    include: {
      items: { orderBy: { position: "asc" } },
      // The newest first: its status picks Pay now or Retry (docs/specs/032-
      // payment-webhooks, behavior 21 and 24)
      payments: {
        orderBy: { createdAt: "desc" },
        select: { status: true, providerRef: true, problem: true },
      },
    },
  })
  if (!order || !credentialOpens(given, number, order, now)) return null

  // The store's address and hours are the settings' current ones, not a
  // snapshot (D5)
  const settings =
    order.fulfillment === "PICKUP"
      ? await db.storeSettings.findUnique({
          where: { id: 1 },
          select: { storeAddress: true, storeHours: true },
        })
      : null

  return {
    orderNumber: order.orderNumber,
    viaLink: given.kind === "link",
    status: order.status satisfies OrderStatusName,
    fulfillment: order.fulfillment satisfies FulfillmentName,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    contact: {
      name: order.contactName,
      email: order.guestEmail,
      mobile: order.contactMobile,
    },
    address:
      order.fulfillment === "DELIVERY"
        ? {
            street: order.street ?? "",
            barangay: order.barangayName ?? "",
            city: order.cityName ?? "",
            province: order.provinceName ?? "",
            region: order.regionName ?? "",
            zip: order.zip ?? "",
          }
        : null,
    store: settings
      ? { address: settings.storeAddress, hours: settings.storeHours }
      : null,
    items: order.items.map((item) => ({
      name: item.nameSnapshot,
      unitPrice: item.priceSnapshot,
      quantity: item.quantity,
      buildId: item.buildId,
      slot: item.slot,
    })),
    subtotal: order.subtotal,
    shippingFee: order.shippingFee,
    discount: order.discount,
    total: order.total,
    paidAt: order.paidAt,
    paymentMethod: order.paymentMethod,
    refundRequired: order.refundRequired,
    cancelReason: order.cancelReason,
    payments: paymentsSummary(order.payments),
  }
}

// One read per request: generateMetadata and the page both ask
export const loadOrder = cache(getOrderForPage)

// An order's id and status, opened by its number and credential with the same
// checks as the page (docs/specs/031-pay-with-xendit: Pay now, the status
// route and the test payment page). `null` for every miss, so callers answer
// them alike.
export async function findOrderByCredential(
  number: unknown,
  credential: unknown,
  now = new Date()
): Promise<{
  id: string
  orderNumber: string
  status: OrderStatusName
} | null> {
  const given = toCredential(credential)
  if (!orderNumberShape(number) || !credentialShape(given)) return null

  const order = await db.order.findUnique({
    where: { orderNumber: number },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      accessTokenHash: true,
    },
  })
  if (!order || !credentialOpens(given, number, order, now)) return null
  return { id: order.id, orderNumber: order.orderNumber, status: order.status }
}

// The access-token form, for callers that hold the key alone
export const findOrderByKey = (number: unknown, key: unknown) =>
  findOrderByCredential(number, key)
