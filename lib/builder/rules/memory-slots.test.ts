import { describe, expect, test } from "vitest"

import {
  buildA,
  buildB,
  buildC,
  buildOf,
  seed,
} from "@/test-support/seed-parts"

import type { Build, BuildPart } from "../types"
import { memorySlots } from "./memory-slots"
import { checkRule } from "./rule"

const withMemory = (
  build: Build,
  part: BuildPart<"memory">,
  quantity: number
): Build => ({ ...build, memory: [{ part, quantity }] })

// docs/specs/019-count-capacity-power-rules, E27–E36
describe("memory slots (error)", () => {
  test("E27: two 2-module kits on a 2-slot board", () => {
    expect(
      checkRule(memorySlots, withMemory(buildC(), seed.vengeanceDdr5, 2))
    ).toEqual({
      rule: "memory-slots",
      severity: "error",
      parts: [
        { slot: "memory", id: "CMK32GX5M2B6000C30" },
        { slot: "motherboard", id: "B650I LIGHTNING WIFI" },
      ],
      message:
        "2 kits of the Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30 make 4 memory modules, but the ASRock B650I Lightning WiFi has 2 memory slots.",
    })
  })

  test("E28: one 4-module kit on a 2-slot board", () => {
    expect(
      checkRule(
        memorySlots,
        buildOf(seed.vengeanceDdr5_4x16, seed.b650iLightning)
      )?.message
    ).toBe(
      "The Corsair Vengeance DDR5-6000 64 GB (4×16 GB) CL36 has 4 memory modules, but the ASRock B650I Lightning WiFi has 2 memory slots."
    )
  })

  test("E29, E30: filling every slot exactly fits", () => {
    expect(
      checkRule(memorySlots, buildOf(seed.vengeanceDdr5_4x16, seed.strixB650a))
    ).toBeNull()
    expect(
      checkRule(
        memorySlots,
        withMemory(buildOf(seed.b650iLightning), seed.furyDdr5_1x16, 2)
      )
    ).toBeNull()
  })

  test("E31: four modules and 192 GB on a 4-slot, 192 GB board", () => {
    const build = withMemory(buildOf(seed.strixB650a), seed.vengeanceDdr5_96, 2)
    expect(checkRule(memorySlots, build)).toBeNull()
  })

  test("E32: too many sticks on the H610M", () => {
    const build = withMemory(buildOf(seed.h610m), seed.lpxDdr4_64, 2)
    expect(checkRule(memorySlots, build)?.severity).toBe("error")
  })

  test("E35: counts modules whatever the memory type", () => {
    const build = withMemory(buildA(), seed.furyDdr4, 2)
    expect(checkRule(memorySlots, build)).toBeNull()
  })

  test("spec 001's builds pass", () => {
    for (const build of [buildA(), buildB(), buildC()]) {
      expect(checkRule(memorySlots, build)).toBeNull()
    }
  })

  test("E36: needs both memory and a board", () => {
    expect(checkRule(memorySlots, buildOf(seed.vengeanceDdr5_4x16))).toBeNull()
    expect(checkRule(memorySlots, buildOf(seed.b650iLightning))).toBeNull()
  })
})
