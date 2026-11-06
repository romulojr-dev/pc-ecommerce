import { createHash, randomBytes } from "node:crypto"

import { withPool } from "./stock"

// Throwaway orders in the database the app server uses, for
// e2e/admin-cancel.spec.ts (docs/specs/044-admin-cancel-order). Inserted
// directly, like the fulfillment fixtures: Admin cancels orders that already
// exist. They hold no stock reservation, so cancelling them changes no
// product's stock. Every value that identifies a person is distinctive, each
// order has its own recipient (the email cap is five per address a day), and
// the customer's access token is known so the spec can open the shopper's
// page. Same production guard as the stock helper. Not a spec itself.

type Fixture = {
  number: string
  name: string
  email: string
  mobile: string
  status: string
}

export const PAID: Fixture = {
  number: "PCS-E2EK0001",
  name: "Mara Villanueva",
  email: "mara.villanueva@example.test",
  mobile: "+639175550401",
  status: "PAID",
}

export const PENDING: Fixture = {
  number: "PCS-E2EK0002",
  name: "Nico Bautista",
  email: "nico.bautista@example.test",
  mobile: "+639175550402",
  status: "PENDING_PAYMENT",
}

export const RACE: Fixture = {
  number: "PCS-E2EK0003",
  name: "Tess Legaspi",
  email: "tess.legaspi@example.test",
  mobile: "+639175550403",
  status: "PAID",
}

export const SHIPPED: Fixture = {
  number: "PCS-E2EK0004",
  name: "Oscar Pangilinan",
  email: "oscar.pangilinan@example.test",
  mobile: "+639175550404",
  status: "SHIPPED",
}

// Left alone by the staff tests, so Demo still sees a cancellable order
export const UNTOUCHED: Fixture = {
  number: "PCS-E2EK0005",
  name: "Gina Salonga",
  email: "gina.salonga@example.test",
  mobile: "+639175550405",
  status: "PAID",
}

const ALL = [PAID, PENDING, RACE, SHIPPED, UNTOUCHED]
export const NUMBERS = ALL.map((o) => o.number)

// Everything a Demo page must not show
export const RAW_VALUES = ALL.flatMap((o) => [
  o.name,
  o.email,
  o.mobile,
  o.mobile.slice(3),
])

// The note a staff member types for Other; Demo must see it hidden
export const NOTE = "Customer phoned from the e2e walkthrough"

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

export async function removeCancelOrders() {
  await withPool(async (pool) => {
    const ids = `(SELECT "id" FROM "Order" WHERE "orderNumber" = ANY($1))`
    await pool.query(`DELETE FROM "EmailOutbox" WHERE "orderId" IN ${ids}`, [
      NUMBERS,
    ])
    await pool.query(`DELETE FROM "OrderItem" WHERE "orderId" IN ${ids}`, [
      NUMBERS,
    ])
    // The audit log is append-only and refuses DELETE, so these entries stay;
    // they point at the order by id and cost nothing
    await pool.query(`DELETE FROM "Order" WHERE "orderNumber" = ANY($1)`, [
      NUMBERS,
    ])
    await pool.query(`DELETE FROM "FakeEmail" WHERE "to" = ANY($1)`, [
      ALL.map((o) => o.email),
    ])
  })
}

export async function createCancelOrders() {
  await removeCancelOrders()
  await withPool(async (pool) => {
    const { rows } = await pool.query<{ id: string; name: string }>(
      `SELECT "id", "name" FROM "Product" WHERE "status" = 'ACTIVE'
       ORDER BY "name" LIMIT 1`
    )
    if (rows.length !== 1) throw new Error("No active product to order.")
    const product = rows[0]

    for (const o of ALL) {
      const id = cuid()
      const paid = o.status !== "PENDING_PAYMENT"
      const shipped = o.status === "SHIPPED"
      await pool.query(
        `INSERT INTO "Order" (
           "id", "orderNumber", "accessTokenHash", "idempotencyKey",
           "cartIdHash", "status", "fulfillment", "paymentOption",
           "guestEmail", "contactName", "contactMobile",
           "regionCode", "regionName", "provinceName", "cityCode", "cityName",
           "barangayCode", "barangayName", "street", "zip", "psgcVersion",
           "zone", "weightGrams", "subtotal", "shippingFee", "discount",
           "total", "expiresAt", "paidAt", "paymentMethod",
           "shippedAt", "courier", "trackingNumber", "updatedAt")
         VALUES (
           $1, $2, $3, $4, $5, $6::"OrderStatus", 'DELIVERY'::"Fulfillment",
           'ONLINE'::"PaymentOption", $7, $8, $9,
           '1300000000', 'National Capital Region (NCR)', 'Metro Manila',
           '1381300000', 'Quezon City', '1381300001', 'Alicia',
           '9 Cancel Lane', '1100', '2026Q3',
           'METRO_MANILA'::"ShippingZone", 900, 2299000, 12000, 0,
           2311000, now() + interval '1 day',
           ${paid ? "now()" : "NULL"}, ${paid ? "'GCASH'" : "NULL"},
           ${shipped ? "now()" : "NULL"},
           ${shipped ? "'LBC'" : "NULL"}, ${shipped ? "'E2ETRK990011'" : "NULL"},
           now())`,
        [
          id,
          o.number,
          sha256(tokenOf(o.number)),
          hash(),
          hash(),
          o.status,
          o.email,
          o.name,
          o.mobile,
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
