import { createHash, randomBytes } from "node:crypto"

import { withPool } from "./stock"

// Throwaway orders for e2e/admin-customers.spec.ts (docs/specs/042-admin-
// customers), inserted directly into the database the app server uses, with
// the same production guard as the stock helper. Two customers nobody else
// uses: Wanda has two orders (one Paid, one Pending payment, the second from
// the same address with a +tag and capitals), Xavier has one Pending payment
// order. Every value that identifies a person is distinctive, so a spec can
// look for it in a page's output. Not a spec itself.

export const WANDA = {
  name: "Wanda Marasigan",
  email: "wanda.marasigan@example.test",
  // The second order spells the address differently: the same customer
  emailAgain: "Wanda.Marasigan+shop@Example.test",
  mobile: "+639175550311",
  street: "31 Wanda Street",
  paidNumber: "PCS-E2EW0001",
  pendingNumber: "PCS-E2EW0002",
} as const

export const XAVIER = {
  name: "Xavier Dimaculangan",
  email: "xavier.dimaculangan@example.test",
  mobile: "+639175550322",
  street: "32 Xavier Street",
  number: "PCS-E2EX0001",
} as const

export const NUMBERS = [WANDA.paidNumber, WANDA.pendingNumber, XAVIER.number]

// Wanda's Paid order is 23,110.00 and the only one that counts
export const WANDA_SPENT = "₱23,110.00"

// Everything a spec must not find on a Demo page
export const RAW_VALUES = [
  WANDA.name,
  "Marasigan",
  WANDA.email,
  WANDA.mobile,
  WANDA.mobile.slice(3),
  WANDA.street,
  XAVIER.name,
  "Dimaculangan",
  XAVIER.email,
  XAVIER.mobile,
  XAVIER.mobile.slice(3),
  XAVIER.street,
  "example.test",
  "Alicia",
  "Quezon City",
]

const hash = () => createHash("sha256").update(randomBytes(16)).digest("hex")
const cuid = () => `c${randomBytes(12).toString("hex")}`

export async function removeCustomerOrders() {
  await withPool(async (pool) => {
    await pool.query(
      `DELETE FROM "OrderItem" WHERE "orderId" IN
         (SELECT "id" FROM "Order" WHERE "orderNumber" = ANY($1))`,
      [NUMBERS]
    )
    await pool.query(`DELETE FROM "Order" WHERE "orderNumber" = ANY($1)`, [
      NUMBERS,
    ])
  })
}

export async function createCustomerOrders() {
  await removeCustomerOrders()
  await withPool(async (pool) => {
    const { rows } = await pool.query<{ id: string; name: string }>(
      `SELECT "id", "name" FROM "Product" WHERE "status" = 'ACTIVE'
       ORDER BY "name" LIMIT 1`
    )
    if (rows.length !== 1) throw new Error("No active product to order.")
    const product = rows[0]

    const insert = async (order: {
      number: string
      email: string
      name: string
      mobile: string
      street: string
      paid: boolean
      // Minutes ago: the order of the list follows the newest order
      minutesAgo: number
    }) => {
      const id = cuid()
      await pool.query(
        `INSERT INTO "Order" (
           "id", "orderNumber", "accessTokenHash", "idempotencyKey",
           "cartIdHash", "status", "fulfillment", "paymentOption",
           "guestEmail", "contactName", "contactMobile",
           "regionCode", "regionName", "provinceName", "cityCode", "cityName",
           "barangayCode", "barangayName", "street", "zip", "psgcVersion",
           "zone", "weightGrams", "subtotal", "shippingFee", "discount",
           "total", "expiresAt", "paidAt", "paymentMethod", "createdAt",
           "updatedAt")
         VALUES (
           $1, $2, $3, $4, $5, ${order.paid ? "'PAID'" : "'PENDING_PAYMENT'"},
           'DELIVERY', 'ONLINE',
           $6, $7, $8,
           '1300000000', 'National Capital Region (NCR)', 'Metro Manila',
           '1381300000', 'Quezon City', '1381300001', 'Alicia', $9, '1100',
           '2026Q3', 'METRO_MANILA', 900, 2299000, 12000, 0, 2311000,
           now() + interval '1 day',
           ${order.paid ? "now()" : "NULL"},
           ${order.paid ? "'FAKE'" : "NULL"},
           now() - ($10 || ' minutes')::interval, now())`,
        [
          id,
          order.number,
          hash(),
          hash(),
          hash(),
          order.email,
          order.name,
          order.mobile,
          order.street,
          String(order.minutesAgo),
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
    await insert({
      number: WANDA.paidNumber,
      email: WANDA.email,
      name: WANDA.name,
      mobile: WANDA.mobile,
      street: WANDA.street,
      paid: true,
      minutesAgo: 2,
    })
    await insert({
      number: WANDA.pendingNumber,
      email: WANDA.emailAgain,
      name: WANDA.name,
      mobile: WANDA.mobile,
      street: WANDA.street,
      paid: false,
      minutesAgo: 1,
    })
    await insert({
      number: XAVIER.number,
      email: XAVIER.email,
      name: XAVIER.name,
      mobile: XAVIER.mobile,
      street: XAVIER.street,
      paid: false,
      minutesAgo: 3,
    })
  })
}
