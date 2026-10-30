// The shape of the generated address files (docs/specs/028-shipping-data-and-
// fee-rules, Behavior 2). Codes are 10-digit PSGC codes as text.

export type Place = { code: string; name: string }

export type Region = Place

export type Barangay = Place

// "pseudo" is a province-level entry PSGC doesn't have: Metro Manila, an
// independent city, the City of Isabela, the Special Geographic Area
export type Province = Place & { kind: "province" | "pseudo" }

// A city or municipality with its barangays, or, in the province an
// independent city lies in, a short entry whose barangays are in
// cities/{cityCode}.json
export type City =
  (Place & { barangays: Barangay[] }) | (Place & { independent: true })

export type Manifest = {
  version: string
  publishedOn: string
  source: string
  counts: {
    regions: number
    provinces: number
    cities: number
    barangays: number
  }
}
