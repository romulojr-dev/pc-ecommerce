import { cache } from "react"

import { db } from "@/lib/db"

import { orderNumberShape } from "./number"
import { DUMMY_TOKEN_HASH, tokenMatches, tokenShape } from "./secrets"
import type { FulfillmentName, OrderStatusName } from "./timeline"
import type { OrderPageData } from "./view"

// Reads an order for its page (docs/specs/030-place-an-order, Behavior 17).
// The order is found by its number and opened with its token; a wrong key, a
// missing key and an unknown number are all `null`, so the page can answer
// them with the same 404.
//
// A number or key of the wrong shape is `null` without a database read. For a
// well-formed pair the cost is the same whether the order exists or not: one
// read and one constant-time comparison (a missing order is compared against
// a fixed hash).

export async function getOrderForPage(
  number: unknown,
  key: unknown
): Promise<OrderPageData | null> {
  if (!orderNumberShape(number) || !tokenShape(key)) return null

  const order = await db.order.findUnique({
    where: { orderNumber: number },
    include: { items: { orderBy: { position: "asc" } } },
  })
  const matches = tokenMatches(key, order?.accessTokenHash ?? DUMMY_TOKEN_HASH)
  if (!order || !matches) return null

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
  }
}

// One read per request: generateMetadata and the page both ask
export const loadOrder = cache(getOrderForPage)
