import { db } from "@/lib/db"
import type { DbClient } from "@/lib/db-client"

import type { ShippingRateTier } from "./fee"
import { fromDbZone } from "./zone-enum"

// The shipping rates and the store settings, read fresh on every call
// (docs/specs/028-shipping-data-and-fee-rules, D16). Checkout is per request
// and a stale fee would be wrong money, so nothing here is cached.

export type StoreSettingsData = {
  // Centavos; null means free shipping is off
  freeShippingThreshold: number | null
  pickupEnabled: boolean
  storeAddress: string
  storeHours: string
  storeInfo: string
  orderExpiryHours: number
}

export type ShippingConfig = {
  rates: ShippingRateTier[]
  settings: StoreSettingsData
}

// No rates is a valid state (every zone is then "no-rate"). A missing settings
// row is a setup error, not something a shopper can reach, so it throws.
export async function getShippingConfig(
  client: DbClient = db
): Promise<ShippingConfig> {
  const [rows, settings] = await Promise.all([
    client.shippingRate.findMany({
      orderBy: [
        { zone: "asc" },
        { maxWeightGrams: { sort: "asc", nulls: "last" } },
      ],
      select: { zone: true, maxWeightGrams: true, fee: true },
    }),
    client.storeSettings.findUnique({
      where: { id: 1 },
      select: {
        freeShippingThreshold: true,
        pickupEnabled: true,
        storeAddress: true,
        storeHours: true,
        storeInfo: true,
        orderExpiryHours: true,
      },
    }),
  ])
  if (!settings) {
    throw new Error("Store settings are missing. Run `pnpm db:seed`.")
  }
  return {
    rates: rows.map(({ zone, maxWeightGrams, fee }) => ({
      zone: fromDbZone[zone],
      maxWeightGrams,
      fee,
    })),
    settings,
  }
}
