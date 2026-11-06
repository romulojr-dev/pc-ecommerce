import { createHash, randomBytes } from "node:crypto"

import { withPool } from "./stock"

// One throwaway paid order in the database the app server uses, for
// e2e/admin-dashboard.spec.ts (docs/specs/048-admin-dashboard). Inserted
// directly, because Admin only reads orders. Its customer is distinctive, so a
// spec can look for it in a page's output. Same production guard as the stock
// helper. Not a spec itself.

export const PAID = {
  number: "PCS-E2ED0001",
  name: "Quentin Abaya",
  email: "quentin.abaya@example.test",
  mobile: "+639175550777",
  street: "5 Dashboard Row",
  // Centavos
  total: 777_700,
} as const

// Everything a spec must not find on a Demo page
export const RAW_VALUES = [
  PAID.name,
  PAID.name.split(" ")[1],
  PAID.email,
  PAID.mobile,
  PAID.mobile.slice(3),
  PAID.street,
]

const hash = () => createHash("sha256").update(randomBytes(16)).digest("hex")
const cuid = () => `c${randomBytes(12).toString("hex")}`

export async function removeDashboardOrder() {
  await withPool(async (pool) => {
    await pool.query(`DELETE FROM "Order" WHERE "orderNumber" = $1`, [
      PAID.number,
    ])
  })
}

// An online order paid just now: it counts in today's paid sales and is the
// newest order
export async function createDashboardOrder() {
  await removeDashboardOrder()
  await withPool(async (pool) => {
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
         $1, $2, $3, $4, $5, 'PAID', 'DELIVERY', 'ONLINE',
         $6, $7, $8,
         '1300000000', 'National Capital Region (NCR)', 'Metro Manila',
         '1381300000', 'Quezon City', '1381300001', 'Alicia', $9, '1100',
         '2026Q3', 'METRO_MANILA', 900, $10, 0, 0, $10,
         now() + interval '1 day', now(), 'FAKE', now(), now())`,
      [
        cuid(),
        PAID.number,
        hash(),
        hash(),
        hash(),
        PAID.email,
        PAID.name,
        PAID.mobile,
        PAID.street,
        PAID.total,
      ]
    )
  })
}
