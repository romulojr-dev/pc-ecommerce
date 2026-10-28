import { describe, expect, test } from "vitest"

import {
  buildA,
  buildB,
  buildC,
  buildOf,
  seed,
  swap,
} from "@/test-support/seed-parts"

import { checkRule } from "./rule"
import { socketMatch } from "./socket-match"

// docs/specs/018-compatibility-rules, E5–E7
describe("socket match (error)", () => {
  test("E5: an LGA1700 CPU doesn't fit an AM5 board", () => {
    expect(checkRule(socketMatch, swap(buildA(), seed.i5_14400f))).toEqual({
      rule: "socket-match",
      severity: "error",
      parts: [
        { slot: "cpu", id: "BX8071514400F" },
        { slot: "motherboard", id: "90MB1BP0-M0AAY0" },
      ],
      message:
        "The Intel Core i5-14400F (LGA1700) doesn't fit the AM5 socket on the ASUS ROG Strix B650-A Gaming WiFi.",
    })
  })

  test("E6: the same socket fits", () => {
    expect(
      checkRule(socketMatch, buildOf(seed.ryzen5_5600, seed.b550Tomahawk))
    ).toBeNull()
  })

  test("spec 001's builds pass", () => {
    for (const build of [buildA(), buildB(), buildC()]) {
      expect(checkRule(socketMatch, build)).toBeNull()
    }
  })

  test("E7: needs both a CPU and a board", () => {
    expect(checkRule(socketMatch, buildOf(seed.i5_14400f))).toBeNull()
    expect(checkRule(socketMatch, buildOf(seed.strixB650a))).toBeNull()
  })
})
