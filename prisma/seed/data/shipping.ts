import type { ShippingZone } from "@/lib/shipping/zones"

// DEMO VALUES. This store, its address and hours are fictional, and these
// shipping rates and the free-shipping threshold are not real courier quotes.
// They exist so the checkout has something to show (docs/specs/028-shipping-
// data-and-fee-rules, section 6). `pnpm db:seed` writes them only when the
// tables are empty or the settings row is missing, so what Admin sets later is
// never overwritten.

export type ShippingSeed = {
  store: {
    // Centavos; null turns free shipping off
    freeShippingThreshold: number | null
    pickupEnabled: boolean
    storeAddress: string
    storeHours: string
    storeInfo: string
    orderExpiryHours: number
  }
  rates: {
    zone: ShippingZone
    // null is the zone's open-ended top tier
    maxWeightGrams: number | null
    // Centavos
    fee: number
  }[]
}

// The email uses the reserved .example domain and there is no phone number,
// so no real person or business can be reached. Quezon City and ZIP 1100 are
// real; the street, plaza and barangay are made up.
const store: ShippingSeed["store"] = {
  // ₱75,000.00
  freeShippingThreshold: 7_500_000,
  pickupEnabled: true,
  storeAddress: [
    "PC Silicon Demo Store",
    "Unit 12, Demo Plaza, 123 Sample Street",
    "Barangay Sample, Quezon City",
    "Metro Manila 1100",
  ].join("\n"),
  storeHours: [
    "Mon–Sat 10:00 AM–7:00 PM",
    "Sun 11:00 AM–5:00 PM",
    "Closed on public holidays",
  ].join("\n"),
  storeInfo:
    "Demo store for a portfolio project. This is not a real shop and no order is fulfilled. Questions: hello@pcsilicon.example",
  orderExpiryHours: 24,
}

// Weight limits in grams: 1 kg, 3 kg, 10 kg, 20 kg, then no limit
const LIMITS = [1_000, 3_000, 10_000, 20_000, null] as const

// Fees in centavos for each limit above
const FEES: Record<ShippingZone, readonly number[]> = {
  "metro-manila": [12_000, 18_000, 30_000, 45_000, 65_000],
  luzon: [15_000, 24_000, 42_000, 65_000, 95_000],
  visayas: [19_000, 32_000, 58_000, 90_000, 130_000],
  mindanao: [21_000, 35_000, 65_000, 100_000, 145_000],
}

const rates: ShippingSeed["rates"] = (
  Object.keys(FEES) as ShippingZone[]
).flatMap((zone) =>
  LIMITS.map((maxWeightGrams, i) => ({
    zone,
    maxWeightGrams,
    fee: FEES[zone][i],
  }))
)

export const shippingSeed: ShippingSeed = { store, rates }
