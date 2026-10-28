import { describe, expect, test } from "vitest"

import {
  buildA,
  buildB,
  buildC,
  buildOf,
  fixturePart,
  seed,
} from "@/test-support/seed-parts"

import type { Build } from "../types"
import { m2Slots } from "./m2-slots"
import { checkRule } from "./rule"

const { pro990, sn850x } = seed

// Every stocked board has at least one M.2 slot
const boardNoM2 = fixturePart("motherboard", "board-no-m2", {
  ...seed.strixB650a.specs,
  m2Slots: 0,
})

// Build C with three M.2 drives on its 2-slot board
const overC = (): Build => ({
  ...buildC(),
  storage: [
    { part: pro990, quantity: 2 },
    { part: sn850x, quantity: 1 },
  ],
})

// docs/specs/019-count-capacity-power-rules, E42–E48
describe("M.2 slots (warning)", () => {
  test("E42: three M.2 drives on a 2-slot board", () => {
    expect(checkRule(m2Slots, overC())).toEqual({
      rule: "m2-slots",
      severity: "warning",
      parts: [
        { slot: "motherboard", id: "B650I LIGHTNING WIFI" },
        { slot: "storage", id: "MZ-V9P1T0BW" },
        { slot: "storage", id: "WDS200T2X0E" },
      ],
      message:
        "This build has 3 M.2 drives, but the ASRock B650I Lightning WiFi has 2 M.2 slots, so 1 drive won't have a slot.",
    })
  })

  test("E43: a 2.5-inch SATA drive doesn't take an M.2 slot", () => {
    const build = overC()
    build.storage = [...build.storage!, { part: seed.mx500, quantity: 1 }]
    const issue = checkRule(m2Slots, build)
    expect(issue?.message).toContain("has 3 M.2 drives")
    expect(issue?.parts.map((part) => part.id)).not.toContain(seed.mx500.id)
  })

  test("E44: as many drives as slots fits", () => {
    expect(
      checkRule(m2Slots, { ...buildC(), ...buildOf(pro990, sn850x) })
    ).toBeNull()
  })

  test("E45: an M.2 2230 drive counts too", () => {
    expect(
      checkRule(m2Slots, buildOf(seed.h610m, seed.sn770m, pro990))?.message
    ).toBe(
      "This build has 2 M.2 drives, but the ASRock H610M-HDV/M.2 R2.0 has 1 M.2 slot, so 1 drive won't have a slot."
    )
  })

  test("E46: 3.5-inch drives never count", () => {
    const build: Build = {
      ...buildOf(seed.h610m),
      storage: [{ part: seed.barracuda2tb, quantity: 3 }],
    }
    expect(checkRule(m2Slots, build)).toBeNull()
  })

  test("E47: a board with no M.2 slots", () => {
    expect(checkRule(m2Slots, buildOf(boardNoM2, pro990))?.message).toBe(
      "This build has 1 M.2 drive, but the Fixture board-no-m2 has no M.2 slots."
    )
  })

  test("several extra drives", () => {
    const build: Build = {
      ...buildOf(seed.h610m),
      storage: [{ part: pro990, quantity: 3 }],
    }
    expect(checkRule(m2Slots, build)?.message).toContain(
      "so 2 drives won't have a slot."
    )
  })

  test("spec 001's builds pass", () => {
    for (const build of [buildA(), buildB(), buildC()]) {
      expect(checkRule(m2Slots, build)).toBeNull()
    }
  })

  test("E48: needs a board and an M.2 drive", () => {
    expect(checkRule(m2Slots, buildOf(pro990, sn850x, seed.nv3))).toBeNull()
    expect(checkRule(m2Slots, buildOf(boardNoM2))).toBeNull()
    expect(checkRule(m2Slots, buildOf(boardNoM2, seed.mx500))).toBeNull()
  })
})
