import { describe, expect, test } from "vitest"

import {
  buildA,
  buildB,
  buildC,
  buildOf,
  fixturePart,
  nb,
  seed,
} from "@/test-support/seed-parts"

import { psuWattage } from "./psu-wattage"
import { checkRule } from "./rule"

const psu = (watts: number) =>
  fixturePart("psu", `psu-${watts}`, { ...seed.mwe550.specs, wattageW: watts })
const severity = (...parts: Parameters<typeof buildOf>) =>
  checkRule(psuWattage, buildOf(...parts))?.severity ?? null

// docs/specs/019-count-capacity-power-rules, E10–E23
describe("PSU wattage (error over 100%, warning above 80%)", () => {
  test("E10: spec 001's builds pass", () => {
    for (const build of [buildA(), buildB(), buildC()]) {
      expect(checkRule(psuWattage, build)).toBeNull()
    }
  })

  test("E11: 958 W on an 850 W power supply is an error", () => {
    expect(
      checkRule(
        psuWattage,
        buildOf(seed.ryzen7_9800x3d, seed.rtx5090Astral, seed.rm850e)
      )
    ).toEqual({
      rule: "psu-wattage",
      severity: "error",
      parts: [
        { slot: "cpu", id: "100-100001084WOF" },
        { slot: "gpu", id: "ROG-ASTRAL-RTX5090-O32G-GAMING" },
        { slot: "psu", id: "CP-9020263-NA" },
      ],
      message: `The AMD Ryzen 7 9800X3D and the ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB need an estimated ${nb("958 W")}, more than the ${nb("850 W")} the Corsair RM850e (2023) 850W supplies.`,
    })
  })

  test("E12: 517 W on a 550 W power supply is a warning", () => {
    const issue = checkRule(
      psuWattage,
      buildOf(seed.i5_14400f, seed.rtx5070Sff, seed.mwe550)
    )
    expect(issue?.severity).toBe("warning")
    expect(issue?.message).toBe(
      `The Intel Core i5-14400F and the Gigabyte GeForce RTX 5070 Windforce OC SFF 12G need an estimated ${nb("517 W")}, 94% of the ${nb("550 W")} the Cooler Master MWE 550 Bronze V2 supplies, close to its limit.`
    )
  })

  test("E13–E15: the RTX 5090 with 1000 W and 1200 W power supplies (spec 011)", () => {
    expect(
      severity(seed.ryzen7_9800x3d, seed.rtx5090Astral, seed.rm1200x)
    ).toBe(null)
    expect(severity(seed.ryzen7_9800x3d, seed.rtx5090Astral, seed.gx1000)).toBe(
      "warning"
    )
    expect(severity(seed.i9_14900k, seed.rtx5090Astral, seed.rm1200x)).toBe(
      "warning"
    )
  })

  test("E16: a GPU alone can overload the power supply", () => {
    const issue = checkRule(
      psuWattage,
      buildOf(seed.rtx5090Astral, seed.mwe550)
    )
    expect(issue?.parts).toEqual([
      { slot: "gpu", id: "ROG-ASTRAL-RTX5090-O32G-GAMING" },
      { slot: "psu", id: "MPE-5501-ACAAB" },
    ])
    expect(issue?.message).toBe(
      `The ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB needs an estimated ${nb("748 W")}, more than the ${nb("550 W")} the Cooler Master MWE 550 Bronze V2 supplies.`
    )
  })

  test("E17: a CPU alone, well within the power supply", () => {
    expect(severity(seed.i5_14400f, seed.mwe550)).toBeNull()
  })

  test("E18: silent without a power supply", () => {
    expect(severity(seed.ryzen7_9800x3d, seed.rtx5090Astral)).toBeNull()
  })

  test("silent with a power supply alone", () => {
    expect(severity(seed.mwe550)).toBeNull()
  })

  test("E19: exactly 80% is fine", () => {
    expect(severity(seed.ryzen9_9950x, seed.rtx3060, seed.a650bn)).toBeNull()
  })

  test("E20, E21: exactly 100% is a warning, not an error", () => {
    expect(severity(seed.i7_14700k, seed.rtx3060, seed.mwe550)).toBe("warning")
    expect(severity(seed.ultra7_265k, seed.rtx5070Prime, seed.a650bn)).toBe(
      "warning"
    )
  })

  test("E22, E23: just over 80% warns, just over 100% is an error", () => {
    const pair = [seed.ryzen5_7600, seed.rtx4060] as const
    expect(severity(...pair, psu(330))).toBeNull()
    expect(severity(...pair, psu(329))).toBe("warning")
    expect(
      checkRule(psuWattage, buildOf(...pair, psu(329)))?.message
    ).toContain("81% of the")
    expect(severity(...pair, psu(264))).toBe("warning")
    expect(severity(...pair, psu(263))).toBe("error")
  })
})
