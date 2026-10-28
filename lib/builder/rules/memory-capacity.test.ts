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

import type { Build, BuildPart } from "../types"
import { memoryCapacity } from "./memory-capacity"
import { checkRule } from "./rule"

const withMemory = (
  build: Build,
  part: BuildPart<"memory">,
  quantity: number
): Build => ({ ...build, memory: [{ part, quantity }] })

// No stocked kit is bigger than its board allows without also needing more
// slots than the board has, so this board is a fixture
const board64 = fixturePart("motherboard", "board-64gb", {
  ...seed.strixB650a.specs,
  maxMemoryGb: 64,
})

// docs/specs/019-count-capacity-power-rules, E27–E36
describe("memory capacity (warning)", () => {
  test("E34: one kit over the board's maximum", () => {
    expect(
      checkRule(memoryCapacity, buildOf(seed.vengeanceDdr5_96, board64))
    ).toEqual({
      rule: "memory-capacity",
      severity: "warning",
      parts: [
        { slot: "memory", id: "CMK96GX5M2B6400C32" },
        { slot: "motherboard", id: "board-64gb" },
      ],
      message: `The Corsair Vengeance DDR5-6400 96 GB (2×48 GB) CL32 is ${nb("96 GB")}, more than the ${nb("64 GB")} the Fixture board-64gb supports.`,
    })
  })

  test("E32: two kits over the H610M's 64 GB (the only seed case)", () => {
    const build = withMemory(buildOf(seed.h610m), seed.lpxDdr4_64, 2)
    expect(checkRule(memoryCapacity, build)?.message).toBe(
      `2 kits of the Corsair Vengeance LPX DDR4-3200 64 GB (2×32 GB) CL16 make ${nb("128 GB")}, more than the ${nb("64 GB")} the ASRock H610M-HDV/M.2 R2.0 supports.`
    )
  })

  test("E31, E33: exactly the board's maximum fits", () => {
    expect(
      checkRule(
        memoryCapacity,
        withMemory(buildOf(seed.strixB650a), seed.vengeanceDdr5_96, 2)
      )
    ).toBeNull()
    expect(
      checkRule(memoryCapacity, buildOf(seed.lpxDdr4_64, seed.h610m))
    ).toBeNull()
  })

  test("E27: too many sticks, but within capacity", () => {
    const build = withMemory(buildC(), seed.vengeanceDdr5, 2)
    expect(checkRule(memoryCapacity, build)).toBeNull()
  })

  test("E35: counts capacity whatever the memory type", () => {
    const build = withMemory(buildA(), seed.lpxDdr4_64, 4)
    expect(checkRule(memoryCapacity, build)?.severity).toBe("warning")
  })

  test("spec 001's builds pass", () => {
    for (const build of [buildA(), buildB(), buildC()]) {
      expect(checkRule(memoryCapacity, build)).toBeNull()
    }
  })

  test("E36: needs both memory and a board", () => {
    expect(checkRule(memoryCapacity, buildOf(seed.vengeanceDdr5_96))).toBeNull()
    expect(checkRule(memoryCapacity, buildOf(board64))).toBeNull()
  })
})
