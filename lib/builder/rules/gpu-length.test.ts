import { describe, expect, test } from "vitest"

import {
  buildA,
  buildB,
  buildC,
  buildOf,
  fixturePart,
  nbsp,
  seed,
  swap,
} from "@/test-support/seed-parts"

import { gpuLength } from "./gpu-length"
import { checkRule } from "./rule"

// No stocked GPU is exactly as long as a case allows, so this one is a fixture
const gpu330 = fixturePart("gpu", "gpu-330", {
  ...seed.rtx4060.specs,
  lengthMm: 330,
})

// docs/specs/018-compatibility-rules, E15–E18
describe("GPU length (error)", () => {
  test("E15: a 358 mm card doesn't fit a 335 mm case", () => {
    expect(checkRule(gpuLength, swap(buildC(), seed.rtx5090Astral))).toEqual({
      rule: "gpu-length",
      severity: "error",
      parts: [
        { slot: "gpu", id: "ROG-ASTRAL-RTX5090-O32G-GAMING" },
        { slot: "case", id: "FD-C-RID1N-11" },
      ],
      message: nbsp(
        "The ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB is 358 mm long, but the Fractal Design Ridge Black fits graphics cards up to 335 mm."
      ),
    })
  })

  test("E16: a tight fit passes (358 ≤ 360)", () => {
    expect(
      checkRule(gpuLength, buildOf(seed.rtx5090Astral, seed.q300l))
    ).toBeNull()
  })

  test("E17: 1 mm over is too long", () => {
    expect(
      checkRule(gpuLength, buildOf(seed.rx9070xtNitro, seed.nr200p))?.message
    ).toBe(
      nbsp(
        "The Sapphire NITRO+ Radeon RX 9070 XT OC 16GB is 331 mm long, but the Cooler Master MasterBox NR200P Black fits graphics cards up to 330 mm."
      )
    )
  })

  test("E18: exactly the case's limit fits", () => {
    expect(checkRule(gpuLength, buildOf(gpu330, seed.nr200p))).toBeNull()
  })

  test("spec 001's builds pass", () => {
    for (const build of [buildA(), buildB(), buildC()]) {
      expect(checkRule(gpuLength, build)).toBeNull()
    }
  })

  test("needs both a GPU and a case", () => {
    expect(checkRule(gpuLength, buildOf(seed.rtx5090Astral))).toBeNull()
  })
})
