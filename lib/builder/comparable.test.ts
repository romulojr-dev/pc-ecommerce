import { describe, expect, test } from "vitest"

import { buildA, buildOf, seed, seedParts } from "@/test-support/seed-parts"

import { checkCandidate } from "./candidate"
import { hasComparableParts, RULE_IDS } from "./comparable"
import { RULES } from "./rules"
import { SLOTS } from "./limits"
import type { Build, Slot } from "./types"

// Whether a product has anything in the build to be compared with
// (docs/specs/023-fits-your-build-hints, E13–E21)

const slotsWithBadge = (build: Build) =>
  SLOTS.filter((slot) => hasComparableParts(build, slot))

describe("hasComparableParts", () => {
  test("a CPU against a build with only storage: no (E13)", () => {
    expect(hasComparableParts(buildOf(seed.mx500), "cpu")).toBe(false)
  })

  test("only a motherboard has anything to compare with a storage-only build (E14)", () => {
    expect(slotsWithBadge(buildOf(seed.mx500))).toEqual(["motherboard"])
  })

  test("an empty build: nothing for any slot (E15)", () => {
    expect(slotsWithBadge({})).toEqual([])
    expect(slotsWithBadge({ cpu: [], storage: [] })).toEqual([])
  })

  test("a CPU alone: motherboard, cooler and PSU (E16)", () => {
    expect(slotsWithBadge(buildOf(seed.ryzen5_7600))).toEqual([
      "motherboard",
      "psu",
      "cpu-cooler",
    ])
  })

  test("a GPU alone: PSU and case (E17)", () => {
    expect(slotsWithBadge(buildOf(seed.rtx4060))).toEqual(
      ["psu", "case"].sort(
        (a, b) => SLOTS.indexOf(a as Slot) - SLOTS.indexOf(b as Slot)
      )
    )
  })

  test("a case alone: motherboard, GPU, PSU and cooler (E18)", () => {
    expect(slotsWithBadge(buildOf(seed.lancool216))).toEqual([
      "motherboard",
      "gpu",
      "psu",
      "cpu-cooler",
    ])
  })

  test("the CPU's own slot is replaced, so Build A's CPU compares with its board (E21)", () => {
    expect(hasComparableParts(buildA(), "cpu")).toBe(true)
  })

  test("a CPU against only its own slot: no", () => {
    expect(hasComparableParts(buildOf(seed.ryzen5_7600), "cpu")).toBe(false)
  })

  test("a PSU needs a CPU or a GPU, not just any part", () => {
    expect(hasComparableParts(buildOf(seed.mx500), "psu")).toBe(false)
    expect(hasComparableParts(buildOf(seed.ryzen5_7600), "psu")).toBe(true)
    expect(hasComparableParts(buildOf(seed.rtx4060), "psu")).toBe(true)
  })

  test("a cooler compares with a board when no CPU is picked (spec 018)", () => {
    const board = buildOf(seed.proB760mDdr4)
    expect(hasComparableParts(board, "cpu-cooler")).toBe(true)
    expect(hasComparableParts(buildOf(seed.peerless), "motherboard")).toBe(true)
  })

  test("a CPU or GPU needs the PSU for the wattage rule", () => {
    expect(hasComparableParts(buildOf(seed.mwe550), "cpu")).toBe(true)
    expect(hasComparableParts(buildOf(seed.mwe550), "gpu")).toBe(true)
  })
})

describe("the table against the rules", () => {
  test("lists every rule, and nothing else", () => {
    expect(RULE_IDS.sort()).toEqual(RULES.map((rule) => rule.id).sort())
  })

  // For every slot and every combination of the other slots filled with
  // Build A's parts: when the helper says there is nothing to compare, no
  // candidate may get an issue, except the one rule that reads the CPU alone.
  test("when it says nothing to compare, the rules find nothing (drift)", () => {
    const full = buildA()
    for (const slot of SLOTS) {
      const others = SLOTS.filter((other) => other !== slot)
      for (let mask = 0; mask < 1 << others.length; mask++) {
        const build: Build = {}
        others.forEach((other, index) => {
          if (mask & (1 << index))
            Object.assign(build, { [other]: full[other] })
        })
        if (hasComparableParts(build, slot)) continue
        for (const part of seedParts(slot)) {
          const rules = checkCandidate(build, slot, part as never).map(
            (issue) => issue.rule
          )
          expect(
            rules.filter((rule) => rule !== "integrated-graphics"),
            `${slot} ${part.name} against ${Object.keys(build).join(", ") || "nothing"}`
          ).toEqual([])
        }
      }
    }
  })
})
