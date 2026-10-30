import { describe, expect, test } from "vitest"

import { checkBuild } from "@/lib/builder"
import { buildA, buildB, seed, swap } from "@/test-support/seed-parts"

import { acknowledgedKeys, unacknowledged, warningKey } from "./warnings"

// docs/specs/026-add-build-to-cart, Rules › Warnings, D1, E8–E10b. Build B
// has one warning (the i5-14400F may need a BIOS update on the B760M board);
// Build B′ is Build B with the MWE 550, which adds a PSU warning.
const buildBPrime = () => swap(buildB(), seed.mwe550)
const BIOS_KEY =
  "bios-update:cpu/BX8071514400F,motherboard/PRO B760M-A WIFI DDR4"
const PSU_KEY =
  "psu-wattage:cpu/BX8071514400F,gpu/GV-N5070WF3OC-12GD,psu/MPE-5501-ACAAB"

describe("warningKey", () => {
  test("is the rule and its parts as slot/id, in the issue's order", () => {
    const [issue] = checkBuild(buildB())
    expect(issue.severity).toBe("warning")
    expect(warningKey(issue)).toBe(BIOS_KEY)
  })

  test("doesn't include the message", () => {
    const [issue] = checkBuild(buildB())
    expect(warningKey({ ...issue, message: "something else" })).toBe(BIOS_KEY)
  })

  test("a PSU warning names its three parts", () => {
    const issue = checkBuild(buildBPrime()).find(
      (found) => found.rule === "psu-wattage"
    )!
    expect(warningKey(issue)).toBe(PSU_KEY)
  })
})

describe("acknowledgedKeys", () => {
  test("lists the keys of the warnings, in checkBuild order", () => {
    expect(acknowledgedKeys(checkBuild(buildBPrime()))).toEqual([
      PSU_KEY,
      BIOS_KEY,
    ])
  })

  test("a build with no issues has none", () => {
    expect(acknowledgedKeys(checkBuild(buildA()))).toEqual([])
  })

  test("leaves errors out", () => {
    const issues = checkBuild(swap(buildB(), seed.strixB650a))
    expect(issues.some((issue) => issue.severity === "error")).toBe(true)
    expect(acknowledgedKeys(issues)).toHaveLength(
      issues.filter((issue) => issue.severity === "warning").length
    )
  })
})

describe("unacknowledged", () => {
  const issues = checkBuild(buildBPrime())

  test("E8: nothing acknowledged → every warning", () => {
    expect(unacknowledged(issues, [])).toEqual(issues)
  })

  test("E9: every key acknowledged → none", () => {
    expect(unacknowledged(issues, [PSU_KEY, BIOS_KEY])).toEqual([])
  })

  test("E10: a key it doesn't have → still unacknowledged", () => {
    expect(
      unacknowledged(issues, ["integrated-graphics:cpu/BX8071514400F"])
    ).toEqual(issues)
  })

  test("E10b: one of two acknowledged → the other", () => {
    expect(unacknowledged(issues, [BIOS_KEY]).map(warningKey)).toEqual([
      PSU_KEY,
    ])
  })

  test("extra keys are ignored", () => {
    expect(unacknowledged(issues, [PSU_KEY, BIOS_KEY, "x", "y"])).toEqual([])
  })

  test("never returns an error: errors can't be acknowledged", () => {
    const withError = checkBuild(swap(buildB(), seed.strixB650a))
    expect(
      unacknowledged(withError, []).every(
        (issue) => issue.severity === "warning"
      )
    ).toBe(true)
  })
})
