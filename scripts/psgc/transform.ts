import type {
  Barangay,
  City,
  Manifest,
  Province,
  Region,
} from "@/lib/psgc/types"

// Turns the PSA's PSGC rows into the generated address files
// (docs/specs/028-shipping-data-and-fee-rules, Behavior 1–6, Rules › PSGC
// facts). Pure: rows in, data out; scripts/convert-psgc.ts reads the workbook
// and writes the files.

// One data row of the workbook's "PSGC" sheet. level is null on the two rows
// the PSA marks "not a province" (City of Isabela, Special Geographic Area).
export type Row = { code: string; name: string; level: string | null }

export type TransformOptions = {
  version: string
  publishedOn: string
  source: string
  independentCityProvinces: Readonly<Record<string, string>>
}

export type Dataset = {
  manifest: Manifest
  regions: Region[]
  // region code → provinces, and province code → cities, both in code order
  provinces: Map<string, Province[]>
  cities: Map<string, City[]>
  // Names changed by more than trimming, and how many only lost spaces
  cleaned: { from: string; to: string }[]
  trimmed: number
}

export class PsgcConvertError extends Error {}

const fail = (row: Row, problem: string): never => {
  throw new PsgcConvertError(`row ${row.code} ${row.name}: ${problem}`)
}

// Trims spaces, removes the PSA's footnote marker (a trailing lowercase
// letter and "/", as in "City of Lucenaa/") and "(Not a Province)". A "/"
// inside a name ("Tondo I/II") is left alone.
export function cleanName(name: string): string {
  return name
    .trim()
    .replace(/[a-z]\/$/, "")
    .replace(/\s*\(Not a Province\)$/, "")
    .trim()
}

// A code cell as a 10-digit string, or null when it isn't a code. The
// workbook stores a few codes as numbers, which loses a leading zero.
export function codeFromCell(cell: unknown): string | null {
  if (typeof cell === "number" && Number.isInteger(cell) && cell >= 0) {
    const code = String(cell).padStart(10, "0")
    return /^\d{10}$/.test(code) ? code : null
  }
  return typeof cell === "string" && /^\d{10}$/.test(cell) ? cell : null
}

const NCR = "13"
const byCode = <T extends { code: string }>(a: T, b: T) =>
  a.code < b.code ? -1 : a.code > b.code ? 1 : 0

export function transformPsgc(
  inputRows: readonly Row[],
  options: TransformOptions
): Dataset {
  const cleaned: Dataset["cleaned"] = []
  let trimmed = 0
  const seen = new Set<string>()

  const rows = inputRows.map((original) => {
    if (!/^\d{10}$/.test(original.code)) fail(original, "not a 10-digit code")
    if (seen.has(original.code)) fail(original, "duplicate code")
    seen.add(original.code)
    const name = cleanName(original.name)
    if (name !== original.name) {
      if (name === original.name.trim()) trimmed++
      else cleaned.push({ from: original.name.trim(), to: name })
    }
    return { ...original, name }
  })

  const regions: Region[] = []
  const regionCodes = new Map<string, string>() // 2-digit prefix → code
  const provinceByPrefix = new Map<string, Province>() // 5-digit prefix
  const places: Row[] = []
  const placeCodes = new Set<string>()
  const subMunicipalities = new Set<string>()
  const barangayRows: Row[] = []

  for (const row of rows) {
    switch (row.level) {
      case "Reg":
        regions.push({ code: row.code, name: row.name })
        regionCodes.set(row.code.slice(0, 2), row.code)
        break
      case "Prov":
        provinceByPrefix.set(row.code.slice(0, 5), {
          code: row.code,
          name: row.name,
          kind: "province",
        })
        break
      case null:
        // PSA's own pseudo-province, with the places that carry its prefix
        provinceByPrefix.set(row.code.slice(0, 5), {
          code: row.code,
          name: row.name,
          kind: "pseudo",
        })
        break
      case "City":
      case "Mun":
        places.push(row)
        placeCodes.add(row.code)
        break
      case "SubMun":
        subMunicipalities.add(row.code)
        break
      case "Bgy":
        barangayRows.push(row)
        break
      default:
        fail(row, `unknown level "${row.level}"`)
    }
  }

  // Which province (real or pseudo) holds each city or municipality
  const provinces = new Map<string, Province>() // province code → province
  const homeOf = new Map<string, string>() // place code → province code
  const independent: Row[] = []
  for (const row of places) {
    const regionCode = regionCodes.get(row.code.slice(0, 2))
    if (!regionCode) fail(row, "its region is not in the data")
    const inPrefix = provinceByPrefix.get(row.code.slice(0, 5))
    let province: Province
    if (inPrefix) {
      province = inPrefix
    } else if (row.code.startsWith(NCR)) {
      province = { code: regionCode!, name: "Metro Manila", kind: "pseudo" }
    } else if (row.level === "City") {
      province = { code: row.code, name: row.name, kind: "pseudo" }
      independent.push(row)
    } else {
      return fail(row, "a municipality with no province")
    }
    provinces.set(province.code, province)
    homeOf.set(row.code, province.code)
  }
  for (const province of provinceByPrefix.values()) {
    provinces.set(province.code, province)
  }

  // Barangays belong to a city or municipality; a district of the City of
  // Manila is skipped and its barangays go to the city
  const barangays = new Map<string, Barangay[]>()
  for (const row of barangayRows) {
    let parent = `${row.code.slice(0, 7)}000`
    if (!placeCodes.has(parent) && subMunicipalities.has(parent)) {
      parent = `${row.code.slice(0, 5)}00000`
    }
    if (!placeCodes.has(parent)) fail(row, "no parent city or municipality")
    const list = barangays.get(parent) ?? []
    list.push({ code: row.code, name: row.name })
    barangays.set(parent, list)
  }

  const cities = new Map<string, City[]>()
  for (const province of provinces.values()) cities.set(province.code, [])
  for (const row of places) {
    cities.get(homeOf.get(row.code)!)!.push({
      code: row.code,
      name: row.name,
      barangays: barangays.get(row.code) ?? [],
    })
  }

  // Each independent city is also listed in the province it lies in
  const map = options.independentCityProvinces
  for (const row of independent) {
    const target = map[row.code]
    if (!target) {
      fail(row, "independent city with no entry in independentCityProvinces")
    }
    const province = provinces.get(target)
    if (
      !province ||
      province.kind !== "province" ||
      target.slice(0, 2) !== row.code.slice(0, 2)
    ) {
      fail(row, `province ${target} is not a province in the same region`)
    }
    cities.get(target)!.push({
      code: row.code,
      name: row.name,
      independent: true,
    })
  }
  const independentCodes = new Set(independent.map((row) => row.code))
  for (const code of Object.keys(map)) {
    if (!independentCodes.has(code)) {
      throw new PsgcConvertError(
        `independentCityProvinces: ${code} is not an independent city in the data`
      )
    }
  }

  for (const list of cities.values()) list.sort(byCode)

  const provincesByRegion = new Map<string, Province[]>()
  for (const region of regions) provincesByRegion.set(region.code, [])
  for (const province of provinces.values()) {
    const regionCode = regionCodes.get(province.code.slice(0, 2))
    if (!regionCode) {
      throw new PsgcConvertError(
        `province ${province.code} ${province.name}: its region is not in the data`
      )
    }
    provincesByRegion.get(regionCode)!.push(province)
  }
  for (const list of provincesByRegion.values()) list.sort(byCode)

  return {
    manifest: {
      version: options.version,
      publishedOn: options.publishedOn,
      source: options.source,
      counts: {
        regions: regions.length,
        provinces: provinces.size,
        cities: places.length,
        barangays: barangayRows.length,
      },
    },
    regions,
    provinces: provincesByRegion,
    cities,
    cleaned,
    trimmed,
  }
}

// The files to write, by path under data/psgc/json/{version}/: compact JSON
// with one trailing newline, so a rerun gives the same bytes
export function toFiles(dataset: Dataset): Record<string, string> {
  const json = (value: unknown) => `${JSON.stringify(value)}\n`
  const files: Record<string, string> = {
    "manifest.json": json(dataset.manifest),
    "regions.json": json(dataset.regions),
  }
  for (const [code, list] of dataset.provinces) {
    files[`provinces/${code}.json`] = json(list)
  }
  for (const [code, list] of dataset.cities) {
    files[`cities/${code}.json`] = json(list)
  }
  return files
}
