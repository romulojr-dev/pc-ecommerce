import { createHash, randomBytes } from "node:crypto"

import { withPool } from "./stock"

// Throwaway orders in the database the app server uses, for
// e2e/admin-fulfillment.spec.ts (docs/specs/043-order-fulfillment-
// transitions). Inserted directly: Admin moves orders that already exist, and
// placing them through the checkout would make the spec slow. Every value that
// identifies a person is distinctive, each order has its own recipient (the
// email cap is five per address a day), and the customer's access token is
// known so the spec can open the shopper's page. Same production guard as the
// stock helper. Not a spec itself.

type Fixture = {
  number: string
  name: string
  email: string
  mobile: string
  street: string
  status: string
  fulfillment: "DELIVERY" | "PICKUP"
  cash: boolean
  parcel?: { courier: string; trackingNumber: string }
}

export const ONLINE_DELIVERY: Fixture = {
  number: "PCS-E2EF0001",
  name: "Ines Barretto",
  email: "ines.barretto@example.test",
  mobile: "+639175550301",
  street: "21 Walkthrough Ave",
  status: "PAID",
  fulfillment: "DELIVERY",
  cash: false,
}

export const CASH_PICKUP: Fixture = {
  number: "PCS-E2EF0002",
  name: "Raul Dimaculangan",
  email: "raul.dimaculangan@example.test",
  mobile: "+639175550302",
  street: "",
  status: "COD_CONFIRMED",
  fulfillment: "PICKUP",
  cash: true,
}

export const RACE: Fixture = {
  number: "PCS-E2EF0003",
  name: "Lota Esguerra",
  email: "lota.esguerra@example.test",
  mobile: "+639175550303",
  street: "5 Race Street",
  status: "PAID",
  fulfillment: "DELIVERY",
  cash: false,
}

export const SHIPPED: Fixture = {
  number: "PCS-E2EF0004",
  name: "Dindo Alcantara",
  email: "dindo.alcantara@example.test",
  mobile: "+639175550304",
  street: "88 Parcel Road",
  status: "SHIPPED",
  fulfillment: "DELIVERY",
  cash: false,
  parcel: { courier: "LBC", trackingNumber: "E2ETRK884217" },
}

const ALL = [ONLINE_DELIVERY, CASH_PICKUP, RACE, SHIPPED]
export const NUMBERS = ALL.map((o) => o.number)

// Everything a Demo page must not show
export const RAW_VALUES = [
  ...ALL.flatMap((o) => [o.name, o.email, o.mobile, o.mobile.slice(3)]),
  SHIPPED.street,
  SHIPPED.parcel!.trackingNumber,
  "E2ETRK8842",
]

// 256-bit tokens, new on every run
const TOKENS = new Map<string, string>()
export const tokenOf = (number: string): string => {
  let token = TOKENS.get(number)
  if (!token) {
    token = randomBytes(32).toString("base64url")
    TOKENS.set(number, token)
  }
  return token
}
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex")
const hash = () => sha256(randomBytes(16).toString("hex"))
const cuid = () => `c${randomBytes(12).toString("hex")}`

export async function removeFulfillmentOrders() {
  await withPool(async (pool) => {
    const ids = `(SELECT "id" FROM "Order" WHERE "orderNumber" = ANY($1))`
    await pool.query(`DELETE FROM "EmailOutbox" WHERE "orderId" IN ${ids}`, [
      NUMBERS,
    ])
    await pool.query(`DELETE FROM "OrderItem" WHERE "orderId" IN ${ids}`, [
      NUMBERS,
    ])
    await pool.query(`DELETE FROM "Order" WHERE "orderNumber" = ANY($1)`, [
      NUMBERS,
    ])
    await pool.query(`DELETE FROM "FakeEmail" WHERE "to" = ANY($1)`, [
      ALL.map((o) => o.email),
    ])
  })
}

export async function createFulfillmentOrders() {
  await removeFulfillmentOrders()
  await withPool(async (pool) => {
    const { rows } = await pool.query<{ id: string; name: string }>(
      `SELECT "id", "name" FROM "Product" WHERE "status" = 'ACTIVE'
       ORDER BY "name" LIMIT 1`
    )
    if (rows.length !== 1) throw new Error("No active product to order.")
    const product = rows[0]

    for (const o of ALL) {
      const id = cuid()
      const pickup = o.fulfillment === "PICKUP"
      const shipped = o.status === "SHIPPED"
      await pool.query(
        `INSERT INTO "Order" (
           "id", "orderNumber", "accessTokenHash", "idempotencyKey",
           "cartIdHash", "status", "fulfillment", "paymentOption",
           "guestEmail", "contactName", "contactMobile",
           "regionCode", "regionName", "provinceName", "cityCode", "cityName",
           "barangayCode", "barangayName", "street", "zip", "psgcVersion",
           "zone", "weightGrams", "subtotal", "shippingFee", "discount",
           "total", "expiresAt", "confirmedAt", "paidAt", "paymentMethod",
           "processingAt", "shippedAt", "courier", "trackingNumber",
           "updatedAt")
         VALUES (
           $1, $2, $3, $4, $5, $6::"OrderStatus", $7::"Fulfillment",
           $8::"PaymentOption", $9, $10, $11,
           $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
           $22::"ShippingZone", 900, 2299000, $23, 0, $24,
           now() + interval '1 day',
           ${o.cash ? "now()" : "NULL"},
           ${o.cash ? "NULL" : "now()"},
           ${o.cash ? "NULL" : "'GCASH'"},
           ${shipped ? "now()" : "NULL"}, ${shipped ? "now()" : "NULL"},
           $25, $26, now())`,
        [
          id,
          o.number,
          sha256(tokenOf(o.number)),
          hash(),
          hash(),
          o.status,
          o.fulfillment,
          o.cash ? "COD" : "ONLINE",
          o.email,
          o.name,
          o.mobile,
          pickup ? null : "1300000000",
          pickup ? null : "National Capital Region (NCR)",
          pickup ? null : "Metro Manila",
          pickup ? null : "1381300000",
          pickup ? null : "Quezon City",
          pickup ? null : "1381300001",
          pickup ? null : "Alicia",
          pickup ? null : o.street,
          pickup ? null : "1100",
          pickup ? null : "2026Q3",
          pickup ? null : "METRO_MANILA",
          pickup ? 0 : 12000,
          pickup ? 2299000 : 2311000,
          o.parcel?.courier ?? null,
          o.parcel?.trackingNumber ?? null,
        ]
      )
      await pool.query(
        `INSERT INTO "OrderItem" (
           "id", "orderId", "productId", "nameSnapshot", "priceSnapshot",
           "quantity", "position")
         VALUES ($1, $2, $3, $4, 1149500, 2, 0)`,
        [cuid(), id, product.id, product.name]
      )
    }
  })
}

// What the customers screen says a person has spent (a cash order counts once
// it is paid at hand-over)
export const CASH_PICKUP_TOTAL = "₱22,990.00"
