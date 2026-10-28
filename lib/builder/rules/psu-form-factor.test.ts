import { describe, expect, test } from "vitest"

import {
  buildA,
  buildB,
  buildC,
  buildOf,
  seed,
  swap,
} from "@/test-support/seed-parts"

import { psuFormFactor } from "./psu-form-factor"
import { checkRule } from "./rule"

// docs/specs/018-compatibility-rules, E35–E37
describe("PSU form factor (error)", () => {
  test("E35: an ATX power supply doesn't fit an SFX-only case", () => {
    expect(checkRule(psuFormFactor, swap(buildC(), seed.rm850e))).toEqual({
      rule: "psu-form-factor",
      severity: "error",
      parts: [
        { slot: "psu", id: "CP-9020263-NA" },
        { slot: "case", id: "FD-C-RID1N-11" },
      ],
      message:
        "The Corsair RM850e (2023) 850W (ATX) doesn't fit the Fractal Design Ridge Black, which takes SFX or SFX-L power supplies.",
    })
  })

  test("E36: SFX-L fits a case that lists it", () => {
    expect(
      checkRule(psuFormFactor, buildOf(seed.sf850l, seed.ridge))
    ).toBeNull()
  })

  test("E37: SFX in an ATX-only case follows the case's data", () => {
    expect(
      checkRule(psuFormFactor, buildOf(seed.sf750, seed.lancool216))?.message
    ).toBe(
      "The Corsair SF750 750W SFX (SFX) doesn't fit the Lian Li LANCOOL 216 Black, which takes ATX power supplies."
    )
    expect(
      checkRule(psuFormFactor, buildOf(seed.sf750, seed.a3Matx))
    ).toBeNull()
  })

  test("spec 001's builds pass", () => {
    for (const build of [buildA(), buildB(), buildC()]) {
      expect(checkRule(psuFormFactor, build)).toBeNull()
    }
  })

  test("needs both a power supply and a case", () => {
    expect(checkRule(psuFormFactor, buildOf(seed.rm850e))).toBeNull()
  })
})
