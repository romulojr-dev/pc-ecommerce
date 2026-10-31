import { randomUUID } from "node:crypto"

import { hashCartId, hashToken } from "@/lib/orders/secrets"

import { db } from "./db"

// Order rows for the integration tests (docs/specs/030-place-an-order). A
// delivery order to Quezon City unless overridden; every column is one the
// migration's CHECKs accept.

type OrderOverrides = Partial<Parameters<typeof db.order.create>[0]["data"]>

export function orderData(overrides: OrderOverrides = {}) {
  const base = {
    orderNumber: `PCS-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`,
    accessTokenHash: hashToken(randomUUID()),
    idempotencyKey: randomUUID(),
    cartIdHash: hashCartId(randomUUID()),
    fulfillment: "DELIVERY" as const,
    guestEmail: "ana@example.com",
    contactName: "Ana Santos",
    contactMobile: "+639171234567",
    regionCode: "1300000000",
    regionName: "National Capital Region (NCR)",
    provinceCode: null,
    provinceName: "Metro Manila",
    cityCode: "1381300000",
    cityName: "Quezon City",
    barangayCode: "1381300001",
    barangayName: "Alicia",
    street: "12 Mabini St",
    zip: "1100",
    psgcVersion: "2026Q3",
    zone: "METRO_MANILA" as const,
    weightGrams: 900,
    subtotal: 2_299_000,
    shippingFee: 12_000,
    total: 2_311_000,
    expiresAt: new Date("2026-11-01T07:42:00Z"),
  }
  return { ...base, ...overrides } as Parameters<
    typeof db.order.create
  >[0]["data"]
}

// A pickup order: no address, no zone
export const pickupOrderData = (overrides: OrderOverrides = {}) =>
  orderData({
    fulfillment: "PICKUP",
    regionCode: null,
    regionName: null,
    provinceCode: null,
    provinceName: null,
    cityCode: null,
    cityName: null,
    barangayCode: null,
    barangayName: null,
    street: null,
    zip: null,
    psgcVersion: null,
    zone: null,
    shippingFee: 0,
    total: 2_299_000,
    ...overrides,
  })
