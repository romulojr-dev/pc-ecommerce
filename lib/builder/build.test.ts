import { describe, expect, test } from "vitest"

import { buildOf, seedPart } from "@/test-support/seed-parts"

import { InvalidBuildError, validateBuild } from "./limits"
import type { Build } from "./types"

// Slot limits (docs/specs/018-compatibility-rules, "Input shape"; E60–E68)

const ryzen5 = seedPart("cpu", "100-100001015BOX")
const i5 = seedPart("cpu", "BX8071514400F")
const rtx4060 = seedPart("gpu", "DUAL-RTX4060-O8G")
const vengeance = seedPart("memory", "CMK32GX5M2B6000C30")
const fury = seedPart("memory", "KF432C16BBK2/16")
const pro990 = seedPart("storage", "MZ-V9P1T0BW")
const sn850x = seedPart("storage", "WDS200T2X0E")
const mwe550 = seedPart("psu", "MPE-5501-ACAAB")

describe("validateBuild", () => {
  test("accepts an empty build and a full one", () => {
    expect(validateBuild({})).toEqual([])
    expect(validateBuild(buildOf(ryzen5, vengeance, pro990, rtx4060))).toEqual(
      []
    )
  })

  test("E60: a one-part slot holds one entry", () => {
    const build: Build = {
      cpu: [
        { part: ryzen5, quantity: 1 },
        { part: i5, quantity: 1 },
      ],
    }
    expect(validateBuild(build)).toEqual(["cpu: holds one entry, got 2"])
  })

  test("E61: a one-part slot takes quantity 1", () => {
    const build: Build = { gpu: [{ part: rtx4060, quantity: 2 }] }
    expect(validateBuild(build)).toEqual(["gpu: quantity must be 1, got 2"])
  })

  test.each([0, -1, 1.5, Number.NaN])(
    "E62: memory quantity %s is not a whole number of at least 1",
    (quantity) => {
      const build: Build = { memory: [{ part: vengeance, quantity }] }
      expect(validateBuild(build)).toEqual([
        `memory: quantity must be a whole number of at least 1, got ${quantity}`,
      ])
    }
  )

  test("memory takes any whole quantity", () => {
    expect(
      validateBuild({ memory: [{ part: vengeance, quantity: 2 }] })
    ).toEqual([])
  })

  test("E63: memory holds one kit", () => {
    const build: Build = {
      memory: [
        { part: vengeance, quantity: 1 },
        { part: fury, quantity: 1 },
      ],
    }
    expect(validateBuild(build)).toEqual(["memory: holds one entry, got 2"])
  })

  test("E64: storage holds several drives, each with a quantity", () => {
    const build: Build = {
      storage: [
        { part: pro990, quantity: 2 },
        { part: sn850x, quantity: 1 },
      ],
    }
    expect(validateBuild(build)).toEqual([])
  })

  test("E65: storage lists each drive once", () => {
    const build: Build = {
      storage: [
        { part: pro990, quantity: 1 },
        { part: pro990, quantity: 1 },
      ],
    }
    expect(validateBuild(build)).toEqual([
      "storage: MZ-V9P1T0BW is listed more than once; use quantity",
    ])
  })

  test("E66: a part's category must be its slot", () => {
    const build = { case: [{ part: mwe550, quantity: 1 }] } as unknown as Build
    expect(validateBuild(build)).toEqual([
      "case: part MPE-5501-ACAAB is a psu, not a case",
    ])
  })

  test("E67: an empty storage list is the same as no storage", () => {
    expect(validateBuild({ storage: [] })).toEqual([])
  })

  test("rejects a key that isn't a builder slot", () => {
    const build = { fans: [{ part: ryzen5, quantity: 1 }] } as unknown as Build
    expect(validateBuild(build)).toEqual(["fans: not a builder slot"])
  })

  test("E68: lists every problem, in slot order", () => {
    const build: Build = {
      gpu: [{ part: rtx4060, quantity: 3 }],
      cpu: [
        { part: ryzen5, quantity: 1 },
        { part: i5, quantity: 1 },
      ],
    }
    expect(validateBuild(build)).toEqual([
      "cpu: holds one entry, got 2",
      "gpu: quantity must be 1, got 3",
    ])
  })
})

describe("InvalidBuildError", () => {
  test("carries the problems and lists them in its message", () => {
    const error = new InvalidBuildError(["cpu: holds one entry, got 2"])
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("InvalidBuildError")
    expect(error.problems).toEqual(["cpu: holds one entry, got 2"])
    expect(error.message).toBe(
      "Invalid build: 1 problem(s)\ncpu: holds one entry, got 2"
    )
  })
})
