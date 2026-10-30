import type { ShippingZone as DbZone } from "@/generated/prisma/client"

import type { ShippingZone } from "./zones"

// The code's zone strings and the database enum, both ways. The Record types
// make a new zone a type error until both maps have it.
export const toDbZone: Record<ShippingZone, DbZone> = {
  "metro-manila": "METRO_MANILA",
  luzon: "LUZON",
  visayas: "VISAYAS",
  mindanao: "MINDANAO",
}

export const fromDbZone: Record<DbZone, ShippingZone> = {
  METRO_MANILA: "metro-manila",
  LUZON: "luzon",
  VISAYAS: "visayas",
  MINDANAO: "mindanao",
}
