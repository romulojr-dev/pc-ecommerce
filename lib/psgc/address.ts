import { z } from "zod"

import { type ShippingZone, zoneOfRegion } from "@/lib/shipping/zones"

import { readPsgcJson } from "./files"
import type { Barangay, City, Place, Province, Region } from "./types"

// Server-side check of a PH address chosen in the form (docs/specs/028-
// shipping-data-and-fee-rules, Behavior 9). It reads the same files the data
// route serves and returns the names from them, never names sent by the
// client.

const codesSchema = z.object({
  regionCode: z.string().regex(/^\d{10}$/),
  provinceCode: z.string().regex(/^\d{10}$/),
  cityCode: z.string().regex(/^\d{10}$/),
  barangayCode: z.string().regex(/^\d{10}$/),
})

export type ResolvedAddress = {
  region: Place
  province: Place
  city: Place
  barangay: Place
  zone: ShippingZone
}

const place = ({ code, name }: Place): Place => ({ code, name })

// Anything that isn't a valid chain (unknown code, malformed value, a barangay
// in another city, …) gives null
export async function resolveAddress(
  input: unknown
): Promise<ResolvedAddress | null> {
  const parsed = codesSchema.safeParse(input)
  if (!parsed.success) return null
  const { regionCode, provinceCode, cityCode, barangayCode } = parsed.data

  const zone = zoneOfRegion(regionCode)
  if (!zone) return null

  const regions = await readPsgcJson<Region[]>({ kind: "regions" })
  const region = regions?.find((r) => r.code === regionCode)
  if (!region) return null

  const provinces = await readPsgcJson<Province[]>({
    kind: "provinces",
    code: regionCode,
  })
  const province = provinces?.find((p) => p.code === provinceCode)
  if (!province) return null

  const cities = await readPsgcJson<City[]>({
    kind: "cities",
    code: provinceCode,
  })
  const city = cities?.find(
    (c): c is Extract<City, { barangays: Barangay[] }> =>
      c.code === cityCode && "barangays" in c
  )
  if (!city) return null

  const barangay = city.barangays.find((b) => b.code === barangayCode)
  if (!barangay) return null

  return {
    region: place(region),
    province: place(province),
    city: place(city),
    barangay: place(barangay),
    zone,
  }
}
