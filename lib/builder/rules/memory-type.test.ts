import { describe, expect, test } from "vitest"

import {
  buildA,
  buildB,
  buildC,
  buildOf,
  seed,
  swap,
} from "@/test-support/seed-parts"

import { memoryType } from "./memory-type"
import { checkRule } from "./rule"

const message =
  "The Kingston FURY Beast DDR4-3200 16 GB (2×8 GB) CL16 is DDR4 memory, but the ASUS ROG Strix B650-A Gaming WiFi takes DDR5."

// docs/specs/018-compatibility-rules, E8–E10
describe("memory type (error)", () => {
  test("E8: a DDR4 kit doesn't fit a DDR5 board", () => {
    expect(checkRule(memoryType, swap(buildA(), seed.furyDdr4))).toEqual({
      rule: "memory-type",
      severity: "error",
      parts: [
        { slot: "memory", id: "KF432C16BBK2/16" },
        { slot: "motherboard", id: "90MB1BP0-M0AAY0" },
      ],
      message,
    })
  })

  test("E9: two kits give one issue, not one per kit", () => {
    const build = {
      ...buildA(),
      memory: [{ part: seed.furyDdr4, quantity: 2 }],
    }
    expect(checkRule(memoryType, build)?.message).toBe(message)
  })

  test("E10: the board's DDR generation decides, not its chipset", () => {
    expect(
      checkRule(memoryType, buildOf(seed.vengeanceDdr5, seed.primeB760m))
    ).toBeNull()
    expect(
      checkRule(memoryType, buildOf(seed.vengeanceDdr5, seed.proB760mDdr4))
        ?.severity
    ).toBe("error")
  })

  test("spec 001's builds pass", () => {
    for (const build of [buildA(), buildB(), buildC()]) {
      expect(checkRule(memoryType, build)).toBeNull()
    }
  })

  test("needs both memory and a board", () => {
    expect(checkRule(memoryType, buildOf(seed.furyDdr4))).toBeNull()
  })
})
