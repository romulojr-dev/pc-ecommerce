import { describe, expect, test } from "vitest"

import { type FieldMeta, specSummary } from "@/lib/specs"

import { summarize } from "./summary"

// The card's summary line, docs/specs/016-home-page ("Product cards").
// Units are joined with a non-breaking space, like the spec table.
const nbsp = " "

describe("specSummary", () => {
  test("joins the marked fields in metadata order, with suffixes", () => {
    const cpu = {
      socket: "AM5",
      generation: "zen-4",
      cores: 6,
      threads: 12,
      baseClockMhz: 3800,
      boostClockMhz: 5100,
      tdpW: 88,
      hasIntegratedGraphics: true,
    }
    expect(specSummary("cpu", cpu)).toBe(`AM5 · 6 cores · 5.1${nbsp}GHz boost`)
  })

  test("uses enum labels and large units", () => {
    const storage = {
      capacityGb: 2000,
      formFactor: "M2_2280",
      interface: "NVME",
    }
    expect(specSummary("storage", storage)).toBe(`2${nbsp}TB · M.2 2280 · NVMe`)
  })

  test("leaves out the field the other cooler type doesn't have", () => {
    expect(specSummary("cpu-cooler", { type: "AIR", heightMm: 155 })).toBe(
      `Air · 155${nbsp}mm tall`
    )
    expect(
      specSummary("cpu-cooler", { type: "AIO", radiatorSizeMm: 360 })
    ).toBe(`Liquid (AIO) · 360${nbsp}mm radiator`)
  })

  test("is null for a category without specs, or specs that aren't an object", () => {
    expect(specSummary("monitor", { sizeIn: 27 })).toBeNull()
    expect(specSummary("cpu", null)).toBeNull()
    expect(specSummary("cpu", "AM5")).toBeNull()
  })

  test("is null when no marked field has a value", () => {
    expect(specSummary("gpu", {})).toBeNull()
  })
})

describe("summarize", () => {
  const fields: Record<string, FieldMeta> = {
    wifi: { label: "Wi-Fi", summary: {} },
    bluetooth: { label: "Bluetooth", summary: {} },
    slots: { label: "Slots", summary: { suffix: "slots" } },
    weight: { label: "Weight", unit: "g" },
  }

  test("shows a true boolean by its label and leaves out a false one", () => {
    expect(summarize(fields, { wifi: true, bluetooth: false, slots: 4 })).toBe(
      "Wi-Fi · 4 slots"
    )
  })

  test("ignores fields that aren't marked", () => {
    expect(summarize(fields, { weight: 900, slots: 2 })).toBe("2 slots")
  })
})
