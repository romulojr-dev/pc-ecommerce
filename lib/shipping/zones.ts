// Shipping zones and the region → zone map (docs/specs/028-shipping-data-and-
// fee-rules, Rules › Region → zone map; FR-16). Pure.

export const SHIPPING_ZONES = [
  "metro-manila",
  "luzon",
  "visayas",
  "mindanao",
] as const

export type ShippingZone = (typeof SHIPPING_ZONES)[number]

// Keyed by the 2-digit region code (the first two digits of the region's
// PSGC code), not the name: the PSA renames regions, codes stay
const REGION_ZONES: Record<string, ShippingZone> = {
  "13": "metro-manila", // NCR
  "14": "luzon", // CAR
  "01": "luzon", // I
  "02": "luzon", // II
  "03": "luzon", // III
  "04": "luzon", // IV-A
  "17": "luzon", // MIMAROPA
  "05": "luzon", // V
  "06": "visayas", // VI
  "18": "visayas", // NIR
  "07": "visayas", // VII
  "08": "visayas", // VIII
  "09": "mindanao", // IX
  "10": "mindanao", // X
  "11": "mindanao", // XI
  "12": "mindanao", // XII
  "16": "mindanao", // XIII
  "19": "mindanao", // BARMM
}

export const REGION_ZONE_CODES = Object.keys(REGION_ZONES)

// The zone of a region given its 10-digit PSGC code, or null when the code
// isn't one or its region has no zone
export function zoneOfRegion(regionCode: string): ShippingZone | null {
  if (!/^\d{10}$/.test(regionCode)) return null
  return REGION_ZONES[regionCode.slice(0, 2)] ?? null
}
