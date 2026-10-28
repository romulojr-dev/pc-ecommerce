import { describe, expect, test } from "vitest"

import {
  buildA,
  buildB,
  buildC,
  buildOf,
  fixturePart,
  seed,
} from "@/test-support/seed-parts"

import { formFactor } from "./form-factor"
import { checkRule } from "./rule"

// No E-ATX boards are stocked, so this one is a fixture
const eAtxBoard = fixturePart("motherboard", "e-atx-board", {
  ...seed.strixB650a.specs,
  formFactor: "E_ATX",
})

// docs/specs/018-compatibility-rules, E11–E14
describe("form factor (error)", () => {
  test("E11: an ATX board doesn't fit an ITX-only case", () => {
    expect(checkRule(formFactor, buildOf(seed.strixB650a, seed.ridge))).toEqual(
      {
        rule: "form-factor",
        severity: "error",
        parts: [
          { slot: "motherboard", id: "90MB1BP0-M0AAY0" },
          { slot: "case", id: "FD-C-RID1N-11" },
        ],
        message:
          "The ASUS ROG Strix B650-A Gaming WiFi (ATX) doesn't fit the Fractal Design Ridge Black, which takes Mini-ITX boards.",
      }
    )
  })

  test("E12: lists every form factor the case takes", () => {
    expect(
      checkRule(formFactor, buildOf(seed.strixB650a, seed.q300l))?.message
    ).toBe(
      "The ASUS ROG Strix B650-A Gaming WiFi (ATX) doesn't fit the Cooler Master MasterBox Q300L, which takes Micro-ATX or Mini-ITX boards."
    )
  })

  test("E13: a Mini-ITX board fits a case that lists Mini-ITX", () => {
    expect(
      checkRule(formFactor, buildOf(seed.b650iLightning, seed.lancool216))
    ).toBeNull()
  })

  test("E14: an E-ATX board needs a case that lists E-ATX", () => {
    expect(
      checkRule(formFactor, buildOf(eAtxBoard, seed.airflow4000d))?.message
    ).toBe(
      "The Fixture e-atx-board (E-ATX) doesn't fit the Corsair 4000D AIRFLOW Black, which takes ATX, Micro-ATX or Mini-ITX boards."
    )
    expect(
      checkRule(formFactor, buildOf(eAtxBoard, seed.lancool216))
    ).toBeNull()
  })

  test("spec 001's builds pass", () => {
    for (const build of [buildA(), buildB(), buildC()]) {
      expect(checkRule(formFactor, build)).toBeNull()
    }
  })

  test("needs both a board and a case", () => {
    expect(checkRule(formFactor, buildOf(seed.ridge))).toBeNull()
  })
})
