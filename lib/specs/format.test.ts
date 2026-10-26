import { describe, expect, test } from "vitest"

import {
  builderCategories,
  formatSpecValue,
  getSpecRows,
  type FieldMeta,
  type Specs,
} from "@/lib/specs"

// Formatting rules from docs/specs/009-spec-table, "Value formatting".
// Units are joined with a non-breaking space.
const nbsp = " "
const { fields: gpu } = builderCategories.gpu
const { fields: cpu } = builderCategories.cpu
const { fields: storage } = builderCategories.storage
const { fields: motherboard } = builderCategories.motherboard
const { fields: caseFields } = builderCategories.case

describe("formatSpecValue", () => {
  test("adds the unit to numbers", () => {
    expect(formatSpecValue(gpu.lengthMm, 228)).toBe(`228${nbsp}mm`)
  })

  test("groups thousands", () => {
    const wattage: FieldMeta = { label: "Wattage", unit: "W", filterable: true }
    expect(formatSpecValue(wattage, 1000)).toBe(`1,000${nbsp}W`)
  })

  test("shows counts without a unit", () => {
    expect(formatSpecValue(cpu.cores, 8)).toBe("8")
  })

  test.each([
    [999, `999${nbsp}GB`],
    [1000, `1${nbsp}TB`],
    [2000, `2${nbsp}TB`],
    [1500, `1.5${nbsp}TB`],
  ])("switches to the large unit at its threshold: %i GB", (gb, text) => {
    expect(formatSpecValue(storage.capacityGb, gb)).toBe(text)
  })

  test("keeps up to 2 decimals in the large unit", () => {
    expect(formatSpecValue(cpu.boostClockMhz, 5100)).toBe(`5.1${nbsp}GHz`)
    expect(formatSpecValue(cpu.boostClockMhz, 5750)).toBe(`5.75${nbsp}GHz`)
  })

  test("shows booleans as Yes or No", () => {
    expect(formatSpecValue(motherboard.hasWifi, true)).toBe("Yes")
    expect(formatSpecValue(motherboard.hasWifi, false)).toBe("No")
  })

  test("shows enum values by their label", () => {
    expect(formatSpecValue(motherboard.formFactor, "MICRO_ATX")).toBe(
      "Micro-ATX"
    )
  })

  test("shows strings as they are", () => {
    expect(formatSpecValue(gpu.chipset, "GeForce RTX 5070")).toBe(
      "GeForce RTX 5070"
    )
  })

  test("joins enum lists by label", () => {
    expect(
      formatSpecValue(motherboard.nativeCpuGenerations, ["zen-4", "zen-5"])
    ).toBe("Zen 4 (Ryzen 7000), Zen 5 (Ryzen 9000)")
  })

  test("joins number lists with the unit once", () => {
    expect(formatSpecValue(caseFields.radiatorSizesMm, [120, 240, 360])).toBe(
      `120, 240, 360${nbsp}mm`
    )
  })

  test("shows an empty list as None", () => {
    expect(formatSpecValue(caseFields.radiatorSizesMm, [])).toBe("None")
  })

  test("returns null for a missing value", () => {
    expect(formatSpecValue(gpu.lengthMm, undefined)).toBeNull()
  })
})

describe("getSpecRows", () => {
  test("lists an ungrouped category in field order", () => {
    const groups = getSpecRows("gpu", {
      chipsetBrand: "NVIDIA",
      chipset: "GeForce RTX 4060",
      vramGb: 8,
      lengthMm: 228,
      boardPowerW: 115,
    })
    expect(groups).toEqual([
      {
        group: undefined,
        rows: [
          { key: "chipsetBrand", label: "Chipset brand", value: "NVIDIA" },
          { key: "chipset", label: "Chipset", value: "GeForce RTX 4060" },
          { key: "vramGb", label: "VRAM", value: `8${nbsp}GB` },
          { key: "lengthMm", label: "Length", value: `228${nbsp}mm` },
          { key: "boardPowerW", label: "Board power", value: `115${nbsp}W` },
        ],
      },
    ])
  })

  test("splits a grouped category by group, in order", () => {
    const groups = getSpecRows("motherboard", {
      socket: "AM5",
      chipset: "B650",
      nativeCpuGenerations: ["zen-4"],
      formFactor: "ATX",
      memoryType: "DDR5",
      memorySlots: 4,
      maxMemoryGb: 192,
      m2Slots: 3,
      hasWifi: true,
    })
    expect(
      groups.map(({ group, rows }) => [group, rows.map((row) => row.key)])
    ).toEqual([
      ["Processor", ["socket", "chipset", "nativeCpuGenerations"]],
      ["Memory", ["memoryType", "memorySlots", "maxMemoryGb"]],
      ["Size and connectivity", ["formFactor", "m2Slots", "hasWifi"]],
    ])
  })

  test("leaves out the other cooler type's field", () => {
    const keys = (specs: Specs<"cpu-cooler">) =>
      getSpecRows("cpu-cooler", specs).flatMap(({ rows }) =>
        rows.map((row) => row.key)
      )
    expect(
      keys({ type: "AIR", supportedSockets: ["AM5"], heightMm: 155 })
    ).toEqual(["type", "supportedSockets", "heightMm"])
    expect(
      keys({ type: "AIO", supportedSockets: ["AM5"], radiatorSizeMm: 360 })
    ).toEqual(["type", "radiatorSizeMm", "supportedSockets"])
  })
})
