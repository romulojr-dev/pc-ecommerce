"use client"

import { useEffect } from "react"

import { Field, selectClass, TextField } from "@/components/checkout/fields"
import { Button } from "@/components/ui/button"
import {
  type AddressLevelKey,
  type CheckoutDraft,
  clearFrom,
} from "@/lib/checkout/draft"
import { independentCityProvinces } from "@/lib/psgc/independent-cities"
import type { Barangay, City, Place, Province, Region } from "@/lib/psgc/types"
import { usePsgcList, type PsgcList } from "@/hooks/use-psgc-list"

// The PH address form (docs/specs/029-checkout-steps, Behavior 12; FR-15):
// region → province → city or municipality → barangay, each list loaded for
// its parent from the address route, then street and ZIP. Changing a parent
// clears its children. A level with one option selects it.

type Props = {
  draft: CheckoutDraft
  errors: Readonly<Record<string, string | undefined>>
  onChange: (next: CheckoutDraft, changed: readonly string[]) => void
}

const byName = (a: Place, b: Place) => a.name.localeCompare(b.name, "en-PH")

// Independent cities appear only under their geographic province (D3), so
// their own pseudo-provinces are left out; Metro Manila and the other
// pseudo-provinces stay
const offeredProvinces = (provinces: Province[]) =>
  provinces
    .filter((p) => !(p.kind === "pseudo" && p.code in independentCityProvinces))
    .sort(byName)

const hasBarangays = (
  city: City | undefined
): city is Extract<City, { barangays: Barangay[] }> =>
  city !== undefined && "barangays" in city

type Level = {
  key: AddressLevelKey
  name: string
  label: string
  placeholder: string
  list: PsgcList<unknown>
  options: Place[]
  error: string | undefined
}

export function AddressFields({ draft, errors, onChange }: Props) {
  const regions = usePsgcList<Region[]>("regions.json")
  const provinces = usePsgcList<Province[]>(
    draft.regionCode ? `provinces/${draft.regionCode}.json` : null
  )
  const cities = usePsgcList<City[]>(
    draft.provinceCode ? `cities/${draft.provinceCode}.json` : null
  )

  const provinceOptions =
    provinces.status === "ready" ? offeredProvinces([...provinces.data]) : []
  const cityOptions =
    cities.status === "ready" ? [...cities.data].sort(byName) : []

  // An independent city is a short entry here; its barangays are in its own
  // file
  const chosenCity = cityOptions.find((c) => c.code === draft.cityCode)
  const own = usePsgcList<City[]>(
    chosenCity && !hasBarangays(chosenCity)
      ? `cities/${chosenCity.code}.json`
      : null
  )
  const ownCity =
    own.status === "ready"
      ? own.data.find((c) => c.code === draft.cityCode)
      : undefined
  const barangayList: PsgcList<unknown> = hasBarangays(chosenCity)
    ? { status: "ready", data: null }
    : chosenCity
      ? own
      : cities.status === "loading"
        ? { status: "loading" }
        : { status: "idle" }
  const barangayOptions = (
    hasBarangays(chosenCity)
      ? chosenCity.barangays
      : hasBarangays(ownCity)
        ? ownCity.barangays
        : []
  )
    .slice()
    .sort(byName)

  const regionOptions = regions.status === "ready" ? regions.data : []

  // A stored code the loaded list doesn't have (a newer dataset) is cleared;
  // a list with one option selects it (D9)
  const settle = (
    key: AddressLevelKey,
    list: PsgcList<unknown>,
    options: Place[]
  ) => {
    if (list.status !== "ready") return
    const current = draft[key]
    if (current && !options.some((o) => o.code === current)) {
      onChange(clearFrom(draft, key), [key])
    } else if (!current && options.length === 1) {
      onChange({ ...draft, [key]: options[0].code }, [key])
    }
  }
  useEffect(() => settle("provinceCode", provinces, provinceOptions))
  useEffect(() => settle("cityCode", cities, cityOptions))
  useEffect(() => settle("barangayCode", barangayList, barangayOptions))

  const levels: Level[] = [
    {
      key: "regionCode",
      name: "region",
      label: "Region",
      placeholder: "Choose a region",
      list: regions,
      options: regionOptions,
      error: errors["address.regionCode"],
    },
    {
      key: "provinceCode",
      name: "province",
      label: "Province",
      placeholder: "Choose a province",
      list: provinces,
      options: provinceOptions,
      error: errors["address.provinceCode"],
    },
    {
      key: "cityCode",
      name: "city",
      label: "City / municipality",
      placeholder: "Choose a city or municipality",
      list: cities,
      options: cityOptions,
      error: errors["address.cityCode"],
    },
    {
      key: "barangayCode",
      name: "barangay",
      label: "Barangay",
      placeholder: "Choose a barangay",
      list: barangayList,
      options: barangayOptions,
      error: errors["address.barangayCode"],
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {levels.map(
          ({ key, name, label, placeholder, list, options, error }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Field name={name} label={label} error={error}>
                {(aria) => (
                  <select
                    {...aria}
                    name={name}
                    className={selectClass}
                    value={draft[key]}
                    disabled={
                      list.status === "idle" || list.status === "loading"
                    }
                    onChange={(event) => {
                      const next = { ...draft, [key]: event.target.value }
                      const child = CHILD[key]
                      onChange(child ? clearFrom(next, child) : next, [key])
                    }}
                  >
                    <option value="">
                      {list.status === "loading" ? "Loading…" : placeholder}
                    </option>
                    {options.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              {list.status === "error" && (
                <div className="flex items-center gap-2 text-xs text-destructive">
                  <span>Couldn&apos;t load the list.</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={list.retry}
                  >
                    Try again
                  </Button>
                </div>
              )}
            </div>
          )
        )}
      </div>
      <TextField
        name="street"
        label="Street address"
        hint="House or unit number, building, street"
        autoComplete="street-address"
        value={draft.street}
        error={errors["address.street"]}
        onChange={(street) => onChange({ ...draft, street }, ["street"])}
      />
      <TextField
        name="zip"
        label="ZIP code"
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={4}
        value={draft.zip}
        error={errors["address.zip"]}
        onChange={(zip) => onChange({ ...draft, zip }, ["zip"])}
      />
    </div>
  )
}

// The level below each one: choosing a value clears it and everything under
// it (Behavior 12)
const CHILD: Record<AddressLevelKey, AddressLevelKey | null> = {
  regionCode: "provinceCode",
  provinceCode: "cityCode",
  cityCode: "barangayCode",
  barangayCode: null,
}
