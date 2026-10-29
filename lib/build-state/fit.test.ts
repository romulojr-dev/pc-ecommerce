import { describe, expect, test, vi } from "vitest"

import type { BuildPart, Slot } from "@/lib/builder"
import { ruleSpecsOf } from "@/lib/specs"
import {
  buildA,
  buildOf,
  seed,
  seedParts,
  swap,
} from "@/test-support/seed-parts"

import { type Fit, fitOf, type FitPart, fitPartOf } from "./fit"

// The "Fits your build" states (docs/specs/023-fits-your-build-hints,
// E1–E12, E19–E21), against Build A unless said

function fitPart(part: BuildPart): FitPart {
  return {
    id: part.id,
    slot: part.category,
    name: part.name,
    ruleSpecs: ruleSpecsOf(part.category, part.specs),
  }
}

function named(slot: Slot, name: string): FitPart {
  const part = seedParts(slot).find((candidate) => candidate.name === name)
  if (!part) throw new Error(`no ${slot} named ${name} in the seed`)
  return fitPart(part)
}

const kind = (fit: Fit) => fit.kind
const rules = (fit: Fit) =>
  "issues" in fit ? fit.issues.map((issue) => issue.rule) : []

describe("fitOf, motherboards against Build A", () => {
  test("AM5 boards fit (E1)", () => {
    for (const name of [
      "ASRock B650M-HDV/M.2",
      "ASRock B650I Lightning WiFi",
      "Gigabyte X870E AORUS ELITE WiFi7",
      "ASRock A620M-HDV/M.2",
      "Gigabyte B650 AORUS ELITE AX",
      "ASUS TUF Gaming B850-PLUS WiFi",
    ]) {
      expect(kind(fitOf(buildA(), named("motherboard", name))), name).toBe(
        "fits"
      )
    }
  })

  test("an LGA1700 DDR4 board doesn't fit, with both errors in order (E2)", () => {
    const fit = fitOf(
      buildA(),
      named("motherboard", "MSI PRO B760M-A WiFi DDR4")
    )
    expect(fit.kind).toBe("errors")
    if (fit.kind !== "errors") return
    expect(fit.issues.map((issue) => issue.message)).toEqual([
      "The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4.",
      "The Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30 is DDR5 memory, but the MSI PRO B760M-A WiFi DDR4 takes DDR4.",
    ])
  })

  test("every board that isn't AM5 doesn't fit (E3)", () => {
    const boards = seedParts("motherboard").filter(
      (board) => board.specs.socket !== "AM5"
    )
    expect(boards).toHaveLength(11)
    for (const board of boards) {
      expect(kind(fitOf(buildA(), fitPart(board))), board.name).toBe("errors")
    }
    expect(
      rules(fitOf(buildA(), named("motherboard", "ASUS PRIME B760M-A WiFi")))
    ).toEqual(["socket-match"])
  })

  test("the board in the build is 'In your build' (E4)", () => {
    expect(kind(fitOf(buildA(), fitPart(seed.strixB650a)))).toBe("in-build")
  })
})

describe("fitOf, other slots against Build A", () => {
  test("a CPU that may need a BIOS update fits with a warning (E5)", () => {
    const fit = fitOf(buildA(), fitPart(seed.ryzen7_9800x3d))
    expect(kind(fit)).toBe("warnings")
    expect(rules(fit)).toEqual(["bios-update"])
    expect(kind(fitOf(buildA(), named("cpu", "AMD Ryzen 5 7600X")))).toBe(
      "fits"
    )
  })

  test("a GPU near the PSU's limit warns, one past it doesn't fit (E6)", () => {
    const warns = fitOf(
      buildA(),
      named("gpu", "ASUS Prime GeForce RTX 5070 Ti OC Edition 16GB")
    )
    expect(kind(warns)).toBe("warnings")
    expect(rules(warns)).toEqual(["psu-wattage"])
    const fails = fitOf(buildA(), fitPart(seed.rtx5090Astral))
    expect(kind(fails)).toBe("errors")
    expect(rules(fails)).toEqual(["psu-wattage"])
    expect(kind(fitOf(buildA(), fitPart(seed.rtx5080Trio)))).toBe("errors")
  })

  test("errors decide, and the warning is still listed after them (E7)", () => {
    const fit = fitOf(buildA(), named("cpu", "Intel Core Ultra 7 265K"))
    expect(kind(fit)).toBe("errors")
    expect(rules(fit)).toEqual(["socket-match", "psu-wattage"])
    if (fit.kind !== "errors") return
    expect(fit.issues.map((issue) => issue.severity)).toEqual([
      "error",
      "warning",
    ])
  })

  test("memory (E8)", () => {
    expect(
      kind(
        fitOf(
          buildA(),
          named("memory", "Kingston FURY Beast DDR4-3200 16 GB (2×8 GB) CL16")
        )
      )
    ).toBe("errors")
    expect(
      kind(
        fitOf(
          buildA(),
          named("memory", "Corsair Vengeance DDR5-6000 64 GB (4×16 GB) CL36")
        )
      )
    ).toBe("fits")
    expect(kind(fitOf(buildA(), fitPart(seed.vengeanceDdr5)))).toBe("in-build")
  })

  test("storage: another drive fits, the held one is in the build (E9)", () => {
    expect(kind(fitOf(buildA(), fitPart(seed.mx500)))).toBe("fits")
    expect(kind(fitOf(buildA(), fitPart(seed.pro990)))).toBe("in-build")
  })

  test("a case and a PSU that don't fit (E10)", () => {
    const ridge = fitOf(buildA(), fitPart(seed.ridge))
    expect(rules(ridge)).toEqual([
      "form-factor",
      "cooler-height",
      "psu-form-factor",
    ])
    expect(rules(fitOf(buildA(), fitPart(seed.sf750)))).toEqual([
      "psu-form-factor",
    ])
  })

  test("a problem the build already has isn't blamed on the candidate (E11)", () => {
    const overloaded = swap(buildA(), seed.rtx5090Astral)
    expect(kind(fitOf(overloaded, fitPart(seed.x870eAorus)))).toBe("fits")
  })
})

describe("fitOf, when there is nothing to compare", () => {
  test("a CPU against a build with only storage: none (E13)", () => {
    expect(kind(fitOf(buildOf(seed.mx500), fitPart(seed.ryzen5_7600)))).toBe(
      "none"
    )
  })

  test("a CPU without integrated graphics: none against storage, a warning against a board (E19, E20)", () => {
    expect(kind(fitOf(buildOf(seed.pro990), fitPart(seed.i5_14400f)))).toBe(
      "none"
    )
    const fit = fitOf(buildOf(seed.proB760mDdr4), fitPart(seed.i5_14400f))
    expect(kind(fit)).toBe("warnings")
    expect(rules(fit)).toEqual(["integrated-graphics", "bios-update"])
  })

  test("an empty build: none", () => {
    expect(kind(fitOf({}, fitPart(seed.ryzen5_7600)))).toBe("none")
  })

  test("the part in the build reads 'In your build' even with nothing to compare (E30)", () => {
    expect(
      kind(fitOf(buildOf(seed.ryzen5_7600), fitPart(seed.ryzen5_7600)))
    ).toBe("in-build")
  })

  test("replacing the CPU compares with the board, cooler and PSU (E21)", () => {
    expect(kind(fitOf(buildA(), fitPart(seed.ryzen7_9800x3d)))).toBe("warnings")
  })
})

describe("fitPartOf", () => {
  const product = (category: string, specs: unknown) => ({
    id: "p1",
    name: "A product",
    category,
    specs,
  })

  test("sends only the rule fields of a builder product (E36)", () => {
    const board = seedParts("motherboard")[0]
    const part = fitPartOf(product("motherboard", board.specs))
    expect(part?.slot).toBe("motherboard")
    expect(Object.keys(part!.ruleSpecs).sort()).toEqual(
      [
        "formFactor",
        "m2Slots",
        "maxMemoryGb",
        "memorySlots",
        "memoryType",
        "nativeCpuGenerations",
        "socket",
      ].sort()
    )
  })

  test("a product outside the builder categories gets none (Behavior 2)", () => {
    expect(fitPartOf(product("monitor", {}))).toBeNull()
  })

  test("specs that don't validate give none, and are logged", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(fitPartOf(product("cpu", { socket: "AM5" }))).toBeNull()
    expect(error).toHaveBeenCalledOnce()
    error.mockRestore()
  })
})
