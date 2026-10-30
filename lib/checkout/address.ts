import { independentCityProvinces } from "@/lib/psgc/independent-cities"
import type { ResolvedAddress } from "@/lib/psgc/address"
import { readPsgcJson } from "@/lib/psgc/files"
import type { Place, Province } from "@/lib/psgc/types"
import type { ShippingZone } from "@/lib/shipping/zones"

// The address the review returns and #78 will snapshot
// (docs/specs/029-checkout-steps, Behavior 30–32, D14). Node only: it reads
// the province file, like resolveAddress. resolveAddress itself is unchanged
// (spec 028 V9, V10); this wraps its result so the same address has one shape
// whichever path the codes came by.

// The province code is the PSA's official parent of the city, and only then.
// Independent cities and the pseudo-provinces (Metro Manila, City of Isabela,
// Special Geographic Area) have none, so their code is null.
export type CheckoutProvince = {
  name: string
  code: string | null
  // The name is the geographic province of an independent city, not an
  // official parent
  geographic: boolean
}

export type PlaceAddress = {
  region: Place
  province: CheckoutProvince
  city: Place
  barangay: Place
  zone: ShippingZone
}

// resolveAddress's result for a valid chain, as one normalized address, or
// null when the region's provinces can't be read
export async function normalizeAddress(
  resolved: ResolvedAddress
): Promise<PlaceAddress | null> {
  const { region, province, city, barangay, zone } = resolved
  const base = { region, city, barangay, zone }

  const provinces = await readPsgcJson<Province[]>({
    kind: "provinces",
    code: region.code,
  })
  const listed = provinces?.find((p) => p.code === province.code)
  if (!listed) return null

  const geographicCode = independentCityProvinces[city.code]
  if (geographicCode) {
    const geographic = provinces?.find((p) => p.code === geographicCode)
    if (!geographic) return null
    return {
      ...base,
      province: { name: geographic.name, code: null, geographic: true },
    }
  }

  return {
    ...base,
    province: {
      name: listed.name,
      code: listed.kind === "province" ? listed.code : null,
      geographic: false,
    },
  }
}

export type AddressLevel = "region" | "province" | "city" | "barangay"

type Codes = {
  regionCode: string
  provinceCode: string
  cityCode: string
  barangayCode: string
}

// The first level of a chain resolveAddress refused that doesn't hold, so the
// form can say which dropdown to choose again (Behavior 17, I10, I11). Each
// level is checked against its parent's file, in the order the form fills
// them in; "barangay" is the last resort.
export async function failingLevel(codes: Codes): Promise<AddressLevel> {
  const regions = await readPsgcJson<Place[]>({ kind: "regions" })
  if (!regions?.some((r) => r.code === codes.regionCode)) return "region"

  const provinces = await readPsgcJson<Province[]>({
    kind: "provinces",
    code: codes.regionCode,
  })
  if (!provinces?.some((p) => p.code === codes.provinceCode)) return "province"

  const cities = await readPsgcJson<{ code: string }[]>({
    kind: "cities",
    code: codes.provinceCode,
  })
  if (!cities?.some((c) => c.code === codes.cityCode)) return "city"
  return "barangay"
}
