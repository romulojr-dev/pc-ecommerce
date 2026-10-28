import { describe, expect, test } from "vitest"

import { type Build, type Slot } from "@/lib/builder"
import { seedCandidates } from "@/test-support/seed-candidates"
import { buildA, buildOf, seed, seedPart } from "@/test-support/seed-parts"

import {
  bannerTitle,
  countLine,
  emptyMessage,
  memoryNote,
  type PickerEntry,
  pickerList,
  pickerTitle,
  stockReason,
} from "./picker"

// docs/specs/021-slot-picker, Examples. Candidates are the seed's parts with
// their stock status on 2026-10-28; the SKU stands in for the product id.

// Messages put a non-breaking space before units ("862 W")
const plain = (text: string) => text.replace(/[  ]/g, " ")

const names = (entries: readonly PickerEntry[]) =>
  entries.map((entry) => entry.candidate.data.part.name)

const entry = (entries: readonly PickerEntry[], name: string) => {
  const found = entries.find((e) => e.candidate.data.part.name === name)
  if (!found) throw new Error(`${name} isn't listed`)
  return found
}

const messages = (issues: readonly { message: string }[]) =>
  issues.map((issue) => plain(issue.message))

function list(
  build: Build,
  slot: Slot,
  options: { showAll?: boolean; replace?: string } = {},
  candidates = seedCandidates(slot)
) {
  return pickerList(build, slot, candidates, {
    showAll: options.showAll ?? false,
    replace: options.replace,
  })
}

const ryzen7600 = buildOf(seed.ryzen5_7600)

describe("the default list", () => {
  test("an empty build hides only what can't be bought (E1)", () => {
    const result = list({}, "cpu")
    expect(result.shown).toBe(23)
    expect(result.total).toBe(26)
    const hidden = result.total - result.entries.length
    expect(hidden).toBe(3)
    expect(names(result.entries)).not.toContain("Intel Core Ultra 7 265K")
    expect(names(result.entries)).not.toContain("AMD Ryzen 9 9900X")
    expect(names(result.entries)).not.toContain("AMD Ryzen 7 5800X3D")
    expect(result.banner).toEqual([])
    expect(result.mode).toBe("add")
    expect(countLine("cpu", result, false)).toBe(
      "23 of 26 CPUs fit your build and are in stock."
    )
  })

  test("a CPU hides boards with another socket, cheapest first (E2)", () => {
    const result = list(ryzen7600, "motherboard")
    expect(names(result.entries)).toEqual([
      "ASRock A620M-HDV/M.2",
      "ASRock B650M-HDV/M.2",
      "Gigabyte B650 AORUS ELITE AX",
      "ASUS ROG Strix B650-A Gaming WiFi",
      "ASUS TUF Gaming B850-PLUS WiFi",
      "ASRock B650I Lightning WiFi",
    ])
    expect(result.entries.every((e) => e.group === "fits")).toBe(true)
    expect(result.entries.every((e) => e.action.kind === "add")).toBe(true)
    expect(countLine("motherboard", result, false)).toBe(
      "6 of 18 motherboards fit your build and are in stock."
    )
  })

  test("warnings stay in the list, after the parts with none (E5)", () => {
    const result = list(buildOf(seed.ryzen7_9800x3d), "motherboard")
    expect(names(result.entries)[0]).toBe("ASUS TUF Gaming B850-PLUS WiFi")
    expect(result.entries[0].group).toBe("fits")
    const rest = result.entries.slice(1)
    expect(rest).toHaveLength(5)
    expect(rest.every((e) => e.group === "warnings")).toBe(true)
    expect(rest.every((e) => e.action.kind === "add")).toBe(true)
    expect(
      messages(
        entry(result.entries, "ASUS ROG Strix B650-A Gaming WiFi").warnings
      )
    ).toEqual([
      "The ASUS ROG Strix B650-A Gaming WiFi may need a BIOS update to run the AMD Ryzen 7 9800X3D: its launch BIOS supports Zen 4 (Ryzen 7000), not Zen 5 (Ryzen 9000).",
    ])
  })

  test("a full build's graphics cards (E6)", () => {
    const result = list(buildA(), "gpu")
    expect(result.shown).toBe(21)
    expect(result.total).toBe(30)
    expect(result.mode).toBe("change")

    const current = entry(result.entries, seed.rtx4060.name)
    expect(current.marker).toEqual({ kind: "current" })
    expect(current.action).toEqual({ kind: "none" })

    const warned = result.entries
      .filter((e) => e.group === "warnings")
      .map((e) => e.candidate.data.part.name)
    expect(warned.sort()).toEqual(
      [
        "ASUS Prime GeForce RTX 5070 Ti OC Edition 16GB",
        "Sapphire NITRO+ Radeon RX 9070 XT OC 16GB",
        "Sapphire PULSE Radeon RX 7800 XT 16GB",
        "Sapphire PULSE Radeon RX 9070 XT 16GB",
      ].sort()
    )
    for (const name of [
      "MSI GeForce RTX 5080 16G Gaming Trio OC",
      "ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB",
      "MSI GeForce RTX 5070 Ti 16G Ventus 3X OC",
      "ASUS Dual GeForce RTX 3060 V2 OC Edition 12GB",
      "MSI GeForce RTX 5060 Ti 16G Ventus 2X OC Plus",
    ]) {
      expect(names(result.entries)).not.toContain(name)
    }
  })

  test("a cooler for another socket is hidden (E7)", () => {
    const result = list(buildA(), "cpu-cooler")
    expect(result.shown).toBe(12)
    expect(names(result.entries)).not.toContain(seed.nhL9i17xx.name)
    const all = list(buildA(), "cpu-cooler", { showAll: true })
    expect(messages(entry(all.entries, seed.nhL9i17xx.name).errors)).toEqual([
      "The Noctua NH-L9i-17xx Low-Profile Cooler doesn't support the AM5 socket of the AMD Ryzen 5 7600. It supports LGA1700 and LGA1851.",
    ])
  })

  test("SFX power supplies don't fit an ATX case (E8)", () => {
    const result = list(buildA(), "psu")
    expect(result.shown).toBe(9)
    expect(names(result.entries)).not.toContain(seed.sf750.name)
    expect(names(result.entries)).not.toContain("Lian Li SP850 850W SFX")
    expect(names(result.entries)).not.toContain(seed.sf850l.name)
  })

  test("adding a drive: every drive fits, held ones say so (E9)", () => {
    const result = list(buildA(), "storage")
    expect(result.mode).toBe("add")
    const all = list(buildA(), "storage", { showAll: true })
    expect(all.entries.every((e) => e.errors.length === 0)).toBe(true)
    // The other two can't be bought now: a pre-order and an out-of-stock HDD
    expect(result.shown).toBe(18)
    expect(names(result.entries)).not.toContain(
      "Samsung 9100 PRO 2TB PCIe Gen5 NVMe SSD"
    )
    expect(names(result.entries)).not.toContain(
      'Seagate IronWolf 8TB 3.5" NAS HDD'
    )
    const held = entry(result.entries, seed.pro990.name)
    expect(held.marker).toEqual({ kind: "in-build", quantity: 1 })
    expect(held.action).toEqual({ kind: "add" })
    expect(result.entries.some((e) => e.marker?.kind === "current")).toBe(false)
  })
})

describe("Show all", () => {
  test("lists every part: fits, then not buyable, then errors (E3)", () => {
    const result = list(ryzen7600, "motherboard", { showAll: true })
    expect(result.entries).toHaveLength(18)
    expect(result.entries.slice(0, 6).every((e) => e.group === "fits")).toBe(
      true
    )
    const x870e = result.entries[6]
    expect(x870e.candidate.data.part.name).toBe(
      "Gigabyte X870E AORUS ELITE WiFi7"
    )
    expect(x870e.group).toBe("unbuyable")
    expect(stockReason(x870e.candidate)).toBe("Out of stock")
    expect(x870e.errors).toEqual([])

    const rest = result.entries.slice(7)
    expect(rest.every((e) => e.group === "incompatible")).toBe(true)
    const prices = rest.map((e) => e.candidate.data.effectivePrice)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))

    expect(
      messages(entry(result.entries, "MSI PRO B760M-A WiFi DDR4").errors)
    ).toEqual([
      "The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4.",
    ])
    const z890 = entry(result.entries, "MSI MAG Z890 Tomahawk WiFi")
    expect(messages(z890.errors)).toEqual([
      "The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1851 socket on the MSI MAG Z890 Tomahawk WiFi.",
    ])
    expect(stockReason(z890.candidate)).toBe(
      "Pre-order: ships February 12, 2027"
    )
    expect(countLine("motherboard", result, true)).toBe(
      "Showing all 18 motherboards."
    )
  })

  test("turning it off gives the default list back (E4)", () => {
    expect(
      names(list(ryzen7600, "motherboard", { showAll: false }).entries)
    ).toEqual(names(list(ryzen7600, "motherboard").entries))
  })
})

describe("actions and precedence", () => {
  test("incompatible and buyable: Add anyway (E13)", () => {
    const result = list(ryzen7600, "motherboard", { showAll: true })
    expect(entry(result.entries, "MSI PRO B760M-A WiFi DDR4").action).toEqual({
      kind: "add-anyway",
    })
  })

  test("not buyable can't be added, errors or not (E14)", () => {
    const result = list(ryzen7600, "motherboard", { showAll: true })
    const disabled = { kind: "disabled", reason: "not-buyable" }
    expect(
      entry(result.entries, "Gigabyte X870E AORUS ELITE WiFi7").action
    ).toEqual(disabled)
    expect(entry(result.entries, "MSI MAG Z890 Tomahawk WiFi").action).toEqual(
      disabled
    )
  })

  test("doesn't fit and can't be bought: doesn't fit, both reasons (E14a)", () => {
    const result = list(buildA(), "gpu", { showAll: true })
    const astral = entry(result.entries, seed.rtx5090Astral.name)
    expect(astral.group).toBe("incompatible")
    expect(messages(astral.errors)).toEqual([
      "The AMD Ryzen 5 7600 and the ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB need an estimated 862 W, more than the 550 W the Cooler Master MWE 550 Bronze V2 supplies.",
    ])
    expect(stockReason(astral.candidate)).toBe("Out of stock")
    expect(astral.action).toEqual({ kind: "disabled", reason: "not-buyable" })

    const rtx3060 = entry(result.entries, seed.rtx3060.name)
    expect(rtx3060.group).toBe("unbuyable")
    const position = (name: string) => names(result.entries).indexOf(name)
    const firstIncompatible = result.entries.findIndex(
      (e) => e.group === "incompatible"
    )
    expect(position(seed.rtx3060.name)).toBeLessThan(firstIncompatible)
  })

  test("Change CPU: the current one has no button (E11a)", () => {
    const result = list(buildA(), "cpu")
    const current = entry(result.entries, seed.ryzen5_7600.name)
    expect(current.group).toBe("fits")
    expect(current.marker).toEqual({ kind: "current" })
    expect(current.action).toEqual({ kind: "none" })
    expect(
      result.entries
        .filter((e) => e !== current && e.group === "fits")
        .every((e) => e.action.kind === "add")
    ).toBe(true)
    expect(pickerTitle("cpu", result.mode, null)).toBe("Change the CPU")
  })

  test("Change memory: the current kit has no button (E11b)", () => {
    const build = buildA()
    build.memory = [{ part: seed.vengeanceDdr5, quantity: 2 }]
    const result = list(build, "memory")
    const current = entry(result.entries, seed.vengeanceDdr5.name)
    expect(current.marker).toEqual({ kind: "current" })
    expect(current.action).toEqual({ kind: "none" })
  })

  test("2 kits: the note, and a 4-module kit no longer fits (E15)", () => {
    const build = buildA()
    build.memory = [{ part: seed.vengeanceDdr5, quantity: 2 }]
    const result = list(build, "memory", { showAll: true })
    expect(result.memoryKits).toBe(2)
    expect(memoryNote(2)).toBe(
      "Your build has 2 kits of memory. The kit you pick keeps that quantity, up to its stock."
    )
    const quad = entry(result.entries, seed.vengeanceDdr5_4x16.name)
    expect(quad.group).toBe("incompatible")
    expect(messages(quad.errors)).toEqual([
      "2 kits of the Corsair Vengeance DDR5-6000 64 GB (4×16 GB) CL36 make 8 memory modules, but the ASUS ROG Strix B650-A Gaming WiFi has 4 memory slots.",
    ])
    expect(list(buildA(), "memory").memoryKits).toBeNull()
  })

  test("a drive at its stock can't be added again (E19)", () => {
    const build = buildA()
    build.storage = [{ part: seed.pro990, quantity: 30 }]
    const result = list(build, "storage")
    expect(entry(result.entries, seed.pro990.name).action).toEqual({
      kind: "disabled",
      reason: "at-stock",
      stock: 30,
    })
  })

  test("a full build: new drives are disabled, held ones can go up (E20)", () => {
    const drives = seedCandidates("storage")
    const build = buildA()
    // 13 drives: with the 7 other parts, 20 products
    build.storage = drives.slice(0, 13).map(({ data }) => ({
      part: seedPart("storage", data.part.id),
      quantity: 1,
    }))
    const result = list(build, "storage", {}, drives)
    expect(result.full).toBe(true)
    for (const e of result.entries) {
      const held = build.storage.some(
        (d) => d.part.id === e.candidate.data.part.id
      )
      expect(e.action).toEqual(
        held ? { kind: "add" } : { kind: "disabled", reason: "full" }
      )
    }
  })

  test("changing a drive: current, other drives held (E21a)", () => {
    const build = buildA()
    build.storage = [...build.storage!, { part: seed.mx500, quantity: 1 }]
    const result = list(build, "storage", { replace: seed.pro990.id })
    expect(result.mode).toBe("change")
    expect(result.replace).toBe(seed.pro990.id)
    expect(entry(result.entries, seed.pro990.name)).toMatchObject({
      marker: { kind: "current" },
      action: { kind: "none" },
    })
    expect(entry(result.entries, seed.mx500.name)).toMatchObject({
      marker: { kind: "in-build", quantity: 1 },
      action: { kind: "add" },
    })
    expect(pickerTitle("storage", result.mode, seed.pro990.name)).toBe(
      "Replace the Samsung 990 PRO 1TB NVMe SSD"
    )
  })

  test("the drive being changed is gone: back to adding (E33)", () => {
    const result = list(buildA(), "storage", { replace: seed.sn850x.id })
    expect(result.mode).toBe("add")
    expect(result.replace).toBeNull()
    expect(pickerTitle("storage", result.mode, null)).toBe("Add a drive")
  })

  test("one-part slots change whenever the slot holds a part", () => {
    expect(list({}, "cpu").mode).toBe("add")
    expect(pickerTitle("cpu", "add", null)).toBe("Choose a CPU")
    expect(list(ryzen7600, "cpu").mode).toBe("change")
  })
})

describe("banner", () => {
  const trio = seedPart("gpu", "GeForce RTX 5090 32G GAMING TRIO OC")

  test("an error no CPU fixes is shown once, not on the CPUs (E23)", () => {
    const build = buildOf(trio, seed.mwe550)
    const result = list(build, "cpu")
    expect(messages(result.banner)).toEqual([
      "The MSI GeForce RTX 5090 32G Gaming Trio OC needs an estimated 748 W, more than the 550 W the Cooler Master MWE 550 Bronze V2 supplies.",
    ])
    expect(bannerTitle("cpu")).toBe("Picking a CPU won't fix this:")
    expect(entry(result.entries, seed.ryzen5_7600.name).errors).toEqual([])
    expect(result.shown).toBe(23)
  })

  test("none in the slot the error comes from (E24)", () => {
    expect(list(buildOf(trio, seed.mwe550), "gpu").banner).toEqual([])
  })

  test("warnings aren't repeated there (E25)", () => {
    expect(list(buildOf(seed.i5_14400f), "gpu").banner).toEqual([])
  })
})

describe("empty states", () => {
  test("nothing fits: names the slots to change (E26)", () => {
    const result = list(buildOf(seed.ryzen5_7600, seed.furyDdr4), "motherboard")
    expect(result.entries).toEqual([])
    expect(result.empty).toBe("none-fit")
    expect(result.changeSlots).toEqual(["cpu", "memory"])
    expect(emptyMessage("motherboard", result)).toBe(
      'No motherboard fits your build. Turn on "Show all" to see why, or change your CPU or memory.'
    )
    const all = list(buildOf(seed.ryzen5_7600, seed.furyDdr4), "motherboard", {
      showAll: true,
    })
    expect(all.entries).toHaveLength(18)
    expect(all.entries.every((e) => e.group === "incompatible")).toBe(true)
  })

  test("some fit, none can be bought (E27)", () => {
    const candidates = seedCandidates("motherboard", {
      "B650I LIGHTNING WIFI": { stock: 0 },
    })
    const build = buildOf(seed.ryzen5_7600, seed.ridge)
    const result = list(build, "motherboard", {}, candidates)
    expect(result.empty).toBe("none-buyable")
    expect(emptyMessage("motherboard", result)).toBe(
      'No motherboard that fits your build is in stock right now. Turn on "Show all" to see the ones that fit, or change your CPU or case.'
    )
    const all = list(build, "motherboard", { showAll: true }, candidates)
    expect(all.entries[0].candidate.data.part.name).toBe(
      seed.b650iLightning.name
    )
    expect(all.entries[0].group).toBe("unbuyable")
    expect(messages(entry(all.entries, seed.strixB650a.name).errors)).toContain(
      "The ASUS ROG Strix B650-A Gaming WiFi (ATX) doesn't fit the Fractal Design Ridge Black, which takes Mini-ITX boards."
    )
  })

  test("no products in the category (E28)", () => {
    const result = list({}, "cpu-cooler", {}, [])
    expect(result.empty).toBe("no-products")
    expect(emptyMessage("cpu-cooler", result)).toBe(
      "There are no CPU coolers in the store right now."
    )
  })

  test("a list with parts has no empty state", () => {
    const result = list(ryzen7600, "motherboard")
    expect(result.empty).toBeNull()
    expect(result.changeSlots).toEqual([])
    expect(emptyMessage("motherboard", result)).toBeNull()
  })

  test("a small case leaves few coolers (E29)", () => {
    const result = list(buildOf(seed.ryzen5_7600, seed.ridge), "cpu-cooler")
    expect(
      result.entries
        .filter((e) => e.group === "fits")
        .map((e) => e.candidate.data.part.name)
        .sort()
    ).toEqual([
      "Arctic Liquid Freezer III 280",
      "Noctua NH-L9a-AM5 Low-Profile Cooler",
    ])
    expect(
      result.entries
        .filter((e) => e.group === "warnings")
        .map((e) => e.candidate.data.part.name)
        .sort()
    ).toEqual(["Arctic Liquid Freezer III 360", "NZXT Kraken 240"])
    expect(result.total - result.shown).toBe(9)
  })
})
