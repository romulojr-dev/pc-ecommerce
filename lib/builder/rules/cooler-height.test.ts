import { describe, expect, test } from "vitest"

import {
  buildA,
  buildB,
  buildC,
  buildOf,
  nbsp,
  seed,
  swap,
} from "@/test-support/seed-parts"

import { coolerHeight } from "./cooler-height"
import { checkRule } from "./rule"

// docs/specs/018-compatibility-rules, E19–E23
describe("cooler height (error)", () => {
  test("E19: a 155 mm tower doesn't fit a 70 mm case", () => {
    expect(checkRule(coolerHeight, swap(buildC(), seed.peerless))).toEqual({
      rule: "cooler-height",
      severity: "error",
      parts: [
        { slot: "cpu-cooler", id: "PA120 SE" },
        { slot: "case", id: "FD-C-RID1N-11" },
      ],
      message: nbsp(
        "The Thermalright Peerless Assassin 120 SE is 155 mm tall, but the Fractal Design Ridge Black fits CPU coolers up to 70 mm."
      ),
    })
  })

  test("E20, E21: exactly the case's limit fits", () => {
    expect(
      checkRule(coolerHeight, buildOf(seed.se224xt, seed.nr200p))
    ).toBeNull()
    expect(checkRule(coolerHeight, buildOf(seed.ak620, seed.q300l))).toBeNull()
  })

  test("E22: 2 mm over is too tall", () => {
    expect(
      checkRule(coolerHeight, buildOf(seed.peerless, seed.nr200p))?.severity
    ).toBe("error")
  })

  test("E23: doesn't apply to liquid coolers", () => {
    expect(
      checkRule(coolerHeight, buildOf(seed.lf3_360, seed.ridge))
    ).toBeNull()
  })

  test("spec 001's builds pass", () => {
    for (const build of [buildA(), buildB(), buildC()]) {
      expect(checkRule(coolerHeight, build)).toBeNull()
    }
  })

  test("needs both a cooler and a case", () => {
    expect(checkRule(coolerHeight, buildOf(seed.peerless))).toBeNull()
  })
})
