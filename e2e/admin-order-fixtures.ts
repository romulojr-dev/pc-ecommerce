import { createHash, randomBytes } from "node:crypto"

import { withPool } from "./stock"

// Two throwaway orders in the database the app server uses, for
// e2e/admin-orders.spec.ts (docs/specs/041-admin-orders-list-detail). Inserted
// directly, because Admin only reads orders: placing them through the checkout
// would make the spec slow and tie it to the cart. Every value that identifies
// a person is distinctive, so a spec can look for it in a page's output. Same
// production guard as the stock helper. Not a spec itself.

export const ONLINE = {
  number: "PCS-E2EA0001",
  name: "Zelda Quintana",
  email: "zelda.quintana@example.test",
  mobile: "+639175550123",
  street: "77 Fixture Road",
} as const

export const CASH = {
  number: "PCS-E2EC0001",
  name: "Yara Villanueva",
  email: "yara.villanueva@example.test",
  mobile: "+639175550199",
  street: "9 Sample Lane",
} as const

export const NUMBERS = [ONLINE.number, CASH.number]

// Everything a spec must not find on a Demo page
export const RAW_VALUES = [
  ...[ONLINE, CASH].flatMap((o) => [
    o.name,
    o.name.split(" ")[1],
    o.email,
    o.mobile,
    o.mobile.slice(3),
    o.street,
  ]),
  "Alicia",
  "Quezon City",
]

const hash = () => createHash("sha256").update(randomBytes(16)).digest("hex")
const cuid = () => `c${randomBytes(12).toString("hex")}`

export async function removeAdminOrders() {
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

export async function createAdminOrders() {
  await removeAdminOrders()
  await withPool(async (pool) => {
    const { rows } = await pool.query<{ id: string; name: string }>(
      `SELECT "id", "name" FROM "Product" WHERE "status" = 'ACTIVE'
       ORDER BY "name" LIMIT 1`
    )
    if (rows.length !== 1) throw new Error("No active product to order.")
    const product = rows[0]

    const insert = async (
      person: typeof ONLINE | typeof CASH,
      cash: boolean
    ) => {
      const id = cuid()
      // Cash orders are confirmed, so they have a confirmedAt and no payment
      await pool.query(
        `INSERT INTO "Order" (
           "id", "orderNumber", "accessTokenHash", "idempotencyKey",
           "cartIdHash", "status", "fulfillment", "paymentOption",
           "guestEmail", "contactName", "contactMobile",
           "regionCode", "regionName", "provinceName", "cityCode", "cityName",
           "barangayCode", "barangayName", "street", "zip", "psgcVersion",
           "zone", "weightGrams", "subtotal", "shippingFee", "discount",
           "total", "expiresAt", "confirmedAt", "updatedAt")
         VALUES (
           $1, $2, $3, $4, $5, ${cash ? "'COD_CONFIRMED'" : "'PENDING_PAYMENT'"},
           'DELIVERY', ${cash ? "'COD'" : "'ONLINE'"},
           $6, $7, $8,
           '1300000000', 'National Capital Region (NCR)', 'Metro Manila',
           '1381300000', 'Quezon City', '1381300001', 'Alicia', $9, '1100',
           '2026Q3', 'METRO_MANILA', 900, 2299000, 12000, 0, 2311000,
           now() + interval '1 day', ${cash ? "now()" : "NULL"}, now())`,
        [
          id,
          person.number,
          hash(),
          hash(),
          hash(),
          person.email,
          person.name,
          person.mobile,
          person.street,
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
    await insert(ONLINE, false)
    await insert(CASH, true)
  })
}
