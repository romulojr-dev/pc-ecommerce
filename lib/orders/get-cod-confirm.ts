import { cache } from "react"

import { db } from "@/lib/db"

import { type ConfirmView, confirmView } from "./cod-confirm-view"
import { codLinkParams, type RawLink } from "./confirm-cod"
import { orderNumberShape } from "./number"
import { verifyCodConfirmLink } from "./order-links"
import type { FulfillmentName } from "./timeline"
import type { OrderPageData, OrderPageItem } from "./view"

// What the cod-confirm page shows (docs/specs/038-cash-on-delivery, Behavior
// 17, D8): the order's items, totals and where it goes while it can still be
// confirmed, and only its number and amount after. Never the contact details.
// Read like any order credential: a link of the wrong shape is `null` with no
// database read; every other miss is `null` too, after one read and the
// signature checked whether or not the order exists. Nothing is written.

export type CodConfirmPageData =
  | {
      view: "confirm"
      orderNumber: string
      fulfillment: FulfillmentName
      expiresAt: Date
      items: OrderPageItem[]
      subtotal: number
      shippingFee: number
      discount: number
      voucherCode: string | null
      total: number
      address: OrderPageData["address"]
      store: OrderPageData["store"]
    }
  | {
      view: Exclude<ConfirmView, "confirm" | "not-found">
      orderNumber: string
      fulfillment: FulfillmentName
      expiresAt: Date
      total: number
    }

export async function getCodConfirmPage(
  orderNumber: unknown,
  link: RawLink,
  now = new Date()
): Promise<CodConfirmPageData | null> {
  const params = codLinkParams(link)
  if (!orderNumberShape(orderNumber) || !params) return null

  const order = await db.order.findUnique({
    where: { orderNumber },
    include: { items: { orderBy: { position: "asc" } } },
  })
  const verdict = verifyCodConfirmLink(orderNumber, params, now)
  const view = confirmView(verdict, order, now)
  if (view === "not-found" || !order) return null

  const base = {
    orderNumber: order.orderNumber,
    fulfillment: order.fulfillment,
    expiresAt: order.expiresAt,
    total: order.total,
  }
  if (view !== "confirm") return { view, ...base }

  // A pickup order shows the store's address and hours as they are now
  const settings =
    order.fulfillment === "PICKUP"
      ? await db.storeSettings.findUnique({
          where: { id: 1 },
          select: { storeAddress: true, storeHours: true },
        })
      : null
  return {
    view,
    ...base,
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
    voucherCode: order.voucherCode,
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
  }
}

// One read per request: generateMetadata and the page both ask
export const loadCodConfirm = cache(
  (orderNumber: unknown, sig: unknown, exp: unknown, p: unknown) =>
    getCodConfirmPage(orderNumber, { sig, exp, p })
)
