import { describe, expect, test } from "vitest"

import {
  buildA,
  buildB,
  buildC,
  buildOf,
  fixturePart,
  seed,
} from "@/test-support/seed-parts"

import { InvalidBuildError } from "./limits"
import { estimateWattage, OTHER_PARTS_ALLOWANCE_W } from "./power"
import type { Build } from "./types"

const psu = (watts: number) =>
  fixturePart("psu", `psu-${watts}`, { ...seed.mwe550.specs, wattageW: watts })

// docs/specs/019-count-capacity-power-rules, E1–E9, E19–E26
describe("estimateWattage", () => {
  test("E1: an empty build draws nothing", () => {
    expect(estimateWattage({})).toEqual({
      watts: 0,
      psuWatts: null,
      loadPercent: null,
    })
  })

  test("E2, E3: the estimate comes before a PSU, with no percentage", () => {
    expect(estimateWattage(buildOf(seed.ryzen5_7600))).toEqual({
      watts: 114,
      psuWatts: null,
      loadPercent: null,
    })
    expect(estimateWattage(buildOf(seed.ryzen5_7600, seed.rtx4060))).toEqual({
      watts: 264,
      psuWatts: null,
      loadPercent: null,
    })
  })

  test("E4: a half watt rounds up", () => {
    expect(estimateWattage(buildOf(seed.rtx5090Astral)).watts).toBe(748)
  })

  test("E5–E7: spec 001's builds", () => {
    expect(estimateWattage(buildA())).toEqual({
      watts: 264,
      psuWatts: 550,
      loadPercent: 48,
    })
    expect(estimateWattage(buildB())).toEqual({
      watts: 517,
      psuWatts: 850,
      loadPercent: 61,
    })
    expect(estimateWattage(buildC())).toEqual({
      watts: 439,
      psuWatts: 750,
      loadPercent: 59,
    })
  })

  test("E8: a PSU alone", () => {
    expect(estimateWattage(buildOf(seed.rm850e))).toEqual({
      watts: 0,
      psuWatts: 850,
      loadPercent: 0,
    })
  })

  test("E9: only the CPU and GPU count", () => {
    const build: Build = {
      ...buildA(),
      memory: [],
      storage: [],
      case: [],
      "cpu-cooler": [],
    }
    expect(estimateWattage(build).watts).toBe(264)
    expect(OTHER_PARTS_ALLOWANCE_W).toBe(0)
  })

  test("E19: exactly 80%", () => {
    const build = buildOf(seed.ryzen9_9950x, seed.rtx3060, seed.a650bn)
    expect(estimateWattage(build)).toEqual({
      watts: 520,
      psuWatts: 650,
      loadPercent: 80,
    })
  })

  test("E20, E21: exactly 100%", () => {
    // 549.9 W rounds to the 550 W the shopper sees
    expect(
      estimateWattage(buildOf(seed.i7_14700k, seed.rtx3060, seed.mwe550))
    ).toEqual({ watts: 550, psuWatts: 550, loadPercent: 100 })
    expect(
      estimateWattage(buildOf(seed.ultra7_265k, seed.rtx5070Prime, seed.a650bn))
    ).toEqual({ watts: 650, psuWatts: 650, loadPercent: 100 })
  })

  test("E22, E23: just over 80% and 100% round the percentage up", () => {
    const pair = [seed.ryzen5_7600, seed.rtx4060] as const
    expect(estimateWattage(buildOf(...pair, psu(329))).loadPercent).toBe(81)
    expect(estimateWattage(buildOf(...pair, psu(263))).loadPercent).toBe(101)
  })

  // In floating point, watts / psuWatts * 100 is 55.00000000000001 for
  // 550 / 1000, which rounds up to 56
  test("E24–E26: exact percentages stay exact", () => {
    expect(
      estimateWattage(buildOf(seed.i7_14700k, seed.rtx3060, seed.gx1000))
    ).toEqual({ watts: 550, psuWatts: 1000, loadPercent: 55 })
    expect(
      estimateWattage(
        buildOf(seed.ryzen9_9950x, seed.rx9070xtNitro, seed.a650bn)
      )
    ).toEqual({ watts: 728, psuWatts: 650, loadPercent: 112 })
    expect(
      estimateWattage(buildOf(seed.i5_14400f, seed.rtx5080Trio, seed.rm1200x))
    ).toEqual({ watts: 660, psuWatts: 1200, loadPercent: 55 })
  })

  test("throws on a build that breaks the slot limits", () => {
    const build: Build = { gpu: [{ part: seed.rtx4060, quantity: 2 }] }
    expect(() => estimateWattage(build)).toThrow(InvalidBuildError)
  })
})
