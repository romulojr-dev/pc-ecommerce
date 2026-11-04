import type { EmailOrder } from "@/lib/email/templates"
import type { EmailViewInput } from "@/lib/email/view"

// Order fixtures for the email tests (docs/specs/036-order-emails, §3). Plain
// objects shaped like an Order with its items: no database.

export const SITE = "https://pcsilicon.tech"
export const VIEW = `${SITE}/orders/PCS-7KQ2M9XD?sig=SIG&exp=1793000000&p=view`
// The cash order's confirm link (docs/specs/038-cash-on-delivery)
export const CONFIRM = `${SITE}/orders/PCS-7KQ2M9XD?sig=SIG&exp=1793000000&p=cod-confirm`
// 2026-11-01T07:00:30Z, Sun 1 Nov 2026, 3:00 PM in Manila
export const NOW = new Date("2026-11-01T07:00:30Z")

export type Item = EmailOrder["items"][number]

export const item = (overrides: Partial<Item>): Item =>
  ({
    nameSnapshot: "AMD Ryzen 5 7600",
    priceSnapshot: 1_149_500,
    quantity: 1,
    buildId: null,
    slot: null,
    ...overrides,
  }) as Item

// P1: spec 036 §3. Two Ryzen 5 7600, delivered to Quezon City.
export const p1 = (overrides: Partial<EmailOrder> = {}): EmailOrder =>
  ({
    orderNumber: "PCS-7KQ2M9XD",
    status: "PENDING_PAYMENT",
    paymentOption: "ONLINE",
    confirmedAt: null,
    fulfillment: "DELIVERY",
    contactName: "Ana Santos",
    street: "12 Mabini St",
    barangayName: "Alicia",
    cityName: "Quezon City",
    provinceName: "Metro Manila",
    regionName: "National Capital Region (NCR)",
    zip: "1100",
    subtotal: 2_299_000,
    shippingFee: 12_000,
    discount: 0,
    voucherId: null,
    voucherCode: null,
    total: 2_311_000,
    expiresAt: new Date("2026-11-02T07:00:00Z"),
    paidAt: null,
    paymentMethod: null,
    cancelReason: null,
    items: [item({ quantity: 2 })],
    ...overrides,
  }) as EmailOrder

export const input = (
  order: EmailOrder,
  overrides: Partial<EmailViewInput> = {}
): EmailViewInput => ({
  order,
  store: null,
  now: NOW,
  viewUrl: `${SITE}/orders/${order.orderNumber}?sig=SIG&exp=1793000000&p=view`,
  confirmUrl: `${SITE}/orders/${order.orderNumber}?sig=SIG&exp=1793000000&p=cod-confirm`,
  siteUrl: SITE,
  ...overrides,
})

// P2: pickup, one build of three parts
export const buildPart = (
  slot: string,
  nameSnapshot: string,
  priceSnapshot: number,
  buildId = "b1"
) => item({ slot, nameSnapshot, priceSnapshot, buildId })

export const p2 = (overrides: Partial<EmailOrder> = {}): EmailOrder =>
  p1({
    orderNumber: "PCS-4TN8V2HC",
    fulfillment: "PICKUP",
    street: null,
    barangayName: null,
    cityName: null,
    provinceName: null,
    regionName: null,
    zip: null,
    subtotal: 4_448_500,
    shippingFee: 0,
    total: 4_448_500,
    items: [
      buildPart("cpu", "AMD Ryzen 5 7600", 1_149_500),
      buildPart("motherboard", "ASUS ROG Strix B650-A Gaming WiFi", 1_499_500),
      buildPart("gpu", "ASUS Dual GeForce RTX 4060 OC Edition 8GB", 1_799_500),
    ],
    ...overrides,
  })

export const STORE = {
  address: "Unit 4, 88 Sample St, Makati",
  hours: "Mon-Sat 10:00 AM-7:00 PM",
}

// C1: spec 038. The same two Ryzen, paid in cash on delivery: Pending
// confirmation, to be confirmed by 2026-11-02 3:00 PM Manila
export const cod1 = (overrides: Partial<EmailOrder> = {}): EmailOrder =>
  p1({ status: "PENDING_CONFIRMATION", paymentOption: "COD", ...overrides })

// C2: pay on pickup, one build of three parts
export const cod2 = (overrides: Partial<EmailOrder> = {}): EmailOrder =>
  p2({ status: "PENDING_CONFIRMATION", paymentOption: "COD", ...overrides })
