import { describe, expect, test } from "vitest"

import {
  buildA,
  buildB,
  buildC,
  buildOf,
  seed,
  seedPart,
  swap,
} from "@/test-support/seed-parts"

import { applyCandidate, checkCandidate } from "./candidate"
import { InvalidBuildError } from "./limits"
import type { Build, BuildPart, Issue } from "./types"

const rules = (issues: Issue[]) => issues.map((issue) => issue.rule)
const drives = (build: Build) =>
  (build.storage ?? []).map(({ part, quantity }) => [part.id, quantity])

const nv3 = seedPart("storage", "SNV3S/1000G")
const { pro990, sn850x } = seed

// docs/specs/018-compatibility-rules, E46–E59
describe("checkCandidate: adding", () => {
  test("E46: a board on another socket gives a socket error", () => {
    const issues = checkCandidate(
      buildOf(seed.ryzen5_7600),
      "motherboard",
      seed.proB760mDdr4
    )
    expect(rules(issues)).toEqual(["socket-match"])
  })

  test("E47: a fitting board gives nothing", () => {
    expect(
      checkCandidate(buildOf(seed.ryzen5_7600), "motherboard", seed.strixB650a)
    ).toEqual([])
  })

  test("E48: leaves out conflicts between other parts", () => {
    const build = buildOf(seed.ryzen5_7600, seed.proB760mDdr4)
    expect(checkCandidate(build, "case", seed.lancool216)).toEqual([])
  })

  test("E49: a memory candidate keeps the slot's quantity", () => {
    const build: Build = {
      ...buildA(),
      memory: [{ part: seed.vengeanceDdr5, quantity: 2 }],
    }
    expect(applyCandidate(build, "memory", seed.furyDdr4).memory).toEqual([
      { part: seed.furyDdr4, quantity: 2 },
    ])
    expect(rules(checkCandidate(build, "memory", seed.furyDdr4))).toEqual([
      "memory-type",
    ])
  })

  test("E50: a drive is added; the others stay", () => {
    const build = buildA()
    expect(drives(applyCandidate(build, "storage", sn850x))).toEqual([
      [pro990.id, 1],
      [sn850x.id, 1],
    ])
    expect(checkCandidate(build, "storage", sn850x)).toEqual([])
  })

  test("adding a drive already listed raises its quantity", () => {
    expect(drives(applyCandidate(buildA(), "storage", pro990))).toEqual([
      [pro990.id, 2],
    ])
  })

  test("E51: a part from another category throws", () => {
    const cpu = seed.ryzen5_7600 as unknown as BuildPart<"gpu">
    expect(() => checkCandidate(buildA(), "gpu", cpu)).toThrow(
      InvalidBuildError
    )
  })
})

describe("checkCandidate: replacing", () => {
  test("E52: the replaced part's conflicts are gone", () => {
    const build = buildOf(seed.i5_14400f, seed.strixB650a)
    expect(checkCandidate(build, "cpu", seed.ryzen5_7600)).toEqual([])
  })

  test("E53: only the candidate's own issues", () => {
    const build = buildOf(seed.ryzen5_7600, seed.strixB650a)
    const issues = checkCandidate(build, "cpu", seed.ryzen7_9800x3d)
    expect(rules(issues)).toEqual(["bios-update"])
    const ids = issues.flatMap((issue) => issue.parts.map((part) => part.id))
    expect(ids).not.toContain(seed.ryzen5_7600.id)
  })

  test("E54: a cooler replaces the cooler", () => {
    const issues = checkCandidate(buildC(), "cpu-cooler", seed.peerless)
    expect(rules(issues)).toEqual(["cooler-height"])
    expect(
      applyCandidate(buildC(), "cpu-cooler", seed.peerless)["cpu-cooler"]
    ).toEqual([{ part: seed.peerless, quantity: 1 }])
  })

  test("E55: changing a drive keeps the drive count", () => {
    const build = swap(buildC(), pro990, sn850x)
    const changed = applyCandidate(build, "storage", nv3, {
      replace: sn850x.id,
    })
    expect(drives(changed)).toEqual([
      [pro990.id, 1],
      [nv3.id, 1],
    ])
    expect(drives(applyCandidate(build, "storage", nv3))).toHaveLength(3)
  })

  test("E56: the new drive keeps the entry's quantity", () => {
    const build: Build = { storage: [{ part: pro990, quantity: 2 }] }
    const changed = applyCandidate(build, "storage", nv3, {
      replace: pro990.id,
    })
    expect(drives(changed)).toEqual([[nv3.id, 2]])
  })

  test("E57: changing to a drive already listed merges the two", () => {
    const build = buildOf(pro990, sn850x)
    const changed = applyCandidate(build, "storage", pro990, {
      replace: sn850x.id,
    })
    expect(drives(changed)).toEqual([[pro990.id, 2]])
  })

  test("E58: changing a drive that isn't there throws", () => {
    expect(() =>
      applyCandidate(buildA(), "storage", nv3, { replace: sn850x.id })
    ).toThrow("storage: cannot replace WDS200T2X0E, it is not in the build")
  })

  test("E59: the part already picked gives its current issues", () => {
    expect(checkCandidate(buildA(), "cpu", seed.ryzen5_7600)).toEqual([])
    expect(rules(checkCandidate(buildB(), "cpu", seed.i5_14400f))).toEqual([
      "bios-update",
    ])
  })

  test("doesn't change the build it is given", () => {
    const build = swap(buildC(), pro990, sn850x)
    const before = structuredClone(build)
    applyCandidate(build, "storage", nv3, { replace: sn850x.id })
    applyCandidate(build, "storage", pro990)
    applyCandidate(build, "cpu", seed.i5_14400f)
    expect(build).toEqual(before)
  })
})
