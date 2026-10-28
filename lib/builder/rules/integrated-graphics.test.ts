import { describe, expect, test } from "vitest"

import {
  buildA,
  buildB,
  buildC,
  buildOf,
  seed,
} from "@/test-support/seed-parts"

import { integratedGraphics } from "./integrated-graphics"
import { checkRule } from "./rule"

// docs/specs/019-count-capacity-power-rules, E37–E41
describe("integrated graphics (warning)", () => {
  test("E38: a CPU without graphics and no graphics card", () => {
    expect(checkRule(integratedGraphics, buildOf(seed.i5_14400f))).toEqual({
      rule: "integrated-graphics",
      severity: "warning",
      parts: [{ slot: "cpu", id: "BX8071514400F" }],
      message:
        "The Intel Core i5-14400F has no integrated graphics, so add a graphics card to get a display.",
    })
  })

  test("E37: build B without its GPU", () => {
    expect(
      checkRule(integratedGraphics, { ...buildB(), gpu: [] })?.severity
    ).toBe("warning")
  })

  test("E39: a CPU with integrated graphics needs no card", () => {
    expect(checkRule(integratedGraphics, buildOf(seed.ryzen5_7600))).toBeNull()
  })

  test("E40: a graphics card covers it", () => {
    expect(
      checkRule(integratedGraphics, buildOf(seed.i5_14400f, seed.rtx4060))
    ).toBeNull()
  })

  test("spec 001's builds pass", () => {
    for (const build of [buildA(), buildB(), buildC()]) {
      expect(checkRule(integratedGraphics, build)).toBeNull()
    }
  })

  test("E41: needs a CPU", () => {
    expect(checkRule(integratedGraphics, {})).toBeNull()
    expect(checkRule(integratedGraphics, buildOf(seed.strixB650a))).toBeNull()
  })
})
