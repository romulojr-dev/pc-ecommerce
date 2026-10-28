import { describe, expect, test } from "vitest"

import { buildA, buildB, buildC, seed, swap } from "@/test-support/seed-parts"

import { buildStatus, checkBuild } from "./check"
import { InvalidBuildError } from "./limits"
import type { Build, Issue } from "./types"

const rules = (issues: Issue[]) => issues.map((issue) => issue.rule)

// docs/specs/018-compatibility-rules, E1–E4, E43–E45
describe("checkBuild", () => {
  test("E1, E3: spec 001's builds A and C have no issues", () => {
    expect(checkBuild(buildA())).toEqual([])
    expect(checkBuild(buildC())).toEqual([])
  })

  test("E2: build B has one warning, a BIOS update", () => {
    const issues = checkBuild(buildB())
    expect(rules(issues)).toEqual(["bios-update"])
    expect(buildStatus(issues)).toBe("warnings")
  })

  test("E4: an empty build has no issues", () => {
    expect(checkBuild({})).toEqual([])
    expect(buildStatus(checkBuild({}))).toBe("ok")
  })

  test("E43: errors come before warnings", () => {
    const issues = checkBuild(swap(buildC(), seed.rm850e, seed.lf3_360))
    expect(rules(issues)).toEqual(["psu-form-factor", "radiator-fit"])
    expect(buildStatus(issues)).toBe("errors")
  })

  test("E44: issues of the same severity follow the PRD table", () => {
    const issues = checkBuild(swap(buildA(), seed.furyDdr4, seed.i5_14400f))
    expect(rules(issues)).toEqual(["socket-match", "memory-type"])
  })

  test("a warning-only rule never outranks an error", () => {
    const issues = checkBuild(
      swap(buildA(), seed.ryzen7_9800x3d, seed.lf3_360, seed.ridge)
    )
    const severities = issues.map((issue) => issue.severity)
    expect(severities).toEqual([...severities].sort())
  })

  test("doesn't change the build, and gives the same answer twice", () => {
    const build = swap(buildC(), seed.rm850e, seed.lf3_360)
    const before = structuredClone(build)
    const first = checkBuild(build)
    expect(build).toEqual(before)
    expect(checkBuild(build)).toEqual(first)
  })

  test("throws on a build that breaks the slot limits", () => {
    const build: Build = { gpu: [{ part: seed.rtx4060, quantity: 2 }] }
    expect(() => checkBuild(build)).toThrow(InvalidBuildError)
  })
})

describe("buildStatus (E45)", () => {
  const warning = checkBuild(buildB())[0]
  const error = checkBuild(swap(buildA(), seed.i5_14400f))[0]

  test("is ok with no issues, warnings with only warnings", () => {
    expect(buildStatus([])).toBe("ok")
    expect(buildStatus([warning])).toBe("warnings")
  })

  test("is errors with any error", () => {
    expect(buildStatus([warning, error, warning])).toBe("errors")
  })
})
