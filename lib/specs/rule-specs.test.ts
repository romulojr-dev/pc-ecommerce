import { describe, expect, test } from "vitest"

import { type Build, checkCandidate, SLOTS } from "@/lib/builder"
import { buildA, buildB, buildC, seedParts } from "@/test-support/seed-parts"

import type { FieldMeta } from "./helpers"
import { builderCategories } from "./registry"
import { ruleSpecsOf } from "./rule-specs"

// The spec fields the "Fits your build" hints send to the browser
// (docs/specs/023-fits-your-build-hints, E36 and the Test plan)

describe("ruleSpecsOf", () => {
  test.each(SLOTS)("%s: keeps exactly the fields a rule reads", (slot) => {
    const fields: Record<string, FieldMeta> = builderCategories[slot].fields
    const tagged = (key: string) => (fields[key].rules?.length ?? 0) > 0
    for (const part of seedParts(slot)) {
      const specs = part.specs as Record<string, unknown>
      const kept = Object.keys(ruleSpecsOf(slot, specs))
      expect(kept.sort()).toEqual(Object.keys(specs).filter(tagged).sort())
    }
  })

  test("a motherboard keeps its rule fields and drops the rest (E36)", () => {
    const [board] = seedParts("motherboard")
    const kept = Object.keys(ruleSpecsOf("motherboard", board.specs))
    expect(kept.sort()).toEqual(
      [
        "formFactor",
        "m2Slots",
        "maxMemoryGb",
        "memorySlots",
        "memoryType",
        "nativeCpuGenerations",
        "socket",
      ].sort()
    )
    expect(kept).not.toContain("chipset")
    expect(kept).not.toContain("hasWifi")
  })

  test("keeps the values untouched", () => {
    const [cpu] = seedParts("cpu")
    expect(ruleSpecsOf("cpu", cpu.specs).socket).toBe(cpu.specs.socket)
  })
})

// A rule that reads a field without `FieldMeta.rules` would see undefined in
// the browser. This runs every seed part against the spec 001 builds, with
// full specs and with the rule fields only, and fails on any difference.
describe("the rules give the same issues with only the rule fields", () => {
  const builds: [string, Build][] = [
    ["Build A", buildA()],
    ["Build B", buildB()],
    ["Build C", buildC()],
  ]

  test.each(builds)("against %s", (_name, build) => {
    for (const slot of SLOTS) {
      for (const part of seedParts(slot)) {
        const trimmed = {
          ...part,
          specs: ruleSpecsOf(slot, part.specs),
        }
        expect(
          checkCandidate(build, slot, trimmed as never),
          `${slot}: ${part.name}`
        ).toEqual(checkCandidate(build, slot, part as never))
      }
    }
  })
})
