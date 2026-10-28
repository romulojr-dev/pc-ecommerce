import { describe, expect, test } from "vitest"

import {
  buildA,
  buildB,
  buildC,
  buildOf,
  fixturePart,
  nbsp,
  seed,
  swap,
} from "@/test-support/seed-parts"

import { radiatorFit } from "./radiator-fit"
import { checkRule } from "./rule"

// Every stocked case takes some radiator, so this one is a fixture
const noRadiatorCase = fixturePart("case", "no-radiator-case", {
  ...seed.q300l.specs,
  radiatorSizesMm: [],
})

// docs/specs/018-compatibility-rules, E30–E34
describe("radiator fit (warning)", () => {
  test("E30: a 360 mm radiator isn't on the case's list", () => {
    expect(checkRule(radiatorFit, swap(buildC(), seed.lf3_360))).toEqual({
      rule: "radiator-fit",
      severity: "warning",
      parts: [
        { slot: "cpu-cooler", id: "ACFRE00136A" },
        { slot: "case", id: "FD-C-RID1N-11" },
      ],
      message: nbsp(
        "The Fractal Design Ridge Black lists 120 or 280 mm radiators, not the 360 mm radiator of the Arctic Liquid Freezer III 360. It may not fit."
      ),
    })
  })

  test("E31: a listed size fits", () => {
    expect(checkRule(radiatorFit, buildOf(seed.lf3_280, seed.ridge))).toBeNull()
  })

  test("E32: the case's own list decides", () => {
    expect(
      checkRule(radiatorFit, buildOf(seed.kraken240, seed.q300l))
    ).toBeNull()
    expect(
      checkRule(radiatorFit, buildOf(seed.lf3_360, seed.q300l))?.message
    ).toBe(
      nbsp(
        "The Cooler Master MasterBox Q300L lists 120, 140 or 240 mm radiators, not the 360 mm radiator of the Arctic Liquid Freezer III 360. It may not fit."
      )
    )
  })

  test("E33: a case that lists no radiators", () => {
    expect(
      checkRule(radiatorFit, buildOf(seed.kraken240, noRadiatorCase))
    ).toEqual({
      rule: "radiator-fit",
      severity: "warning",
      parts: [
        { slot: "cpu-cooler", id: "RL-KN240-B1" },
        { slot: "case", id: "no-radiator-case" },
      ],
      message: nbsp(
        "The Fixture no-radiator-case doesn't list any radiator mounts, so the 240 mm radiator of the NZXT Kraken 240 may not fit."
      ),
    })
  })

  test("E34: doesn't apply to air coolers", () => {
    expect(
      checkRule(radiatorFit, buildOf(seed.peerless, noRadiatorCase))
    ).toBeNull()
  })

  test("spec 001's builds pass", () => {
    for (const build of [buildA(), buildB(), buildC()]) {
      expect(checkRule(radiatorFit, build)).toBeNull()
    }
  })

  test("needs both a cooler and a case", () => {
    expect(checkRule(radiatorFit, buildOf(seed.lf3_360))).toBeNull()
  })
})
