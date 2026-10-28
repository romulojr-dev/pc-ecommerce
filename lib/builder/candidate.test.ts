import { describe, expect, test } from "vitest"

import {
  buildA,
  buildB,
  buildC,
  buildOf,
  fixturePart,
  seed,
  seedPart,
  seedParts,
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

  test("E59: the part already picked gives the issues it adds", () => {
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

// docs/specs/019-count-capacity-power-rules, E60–E75: issues new or more
// severe than in the baseline (the build with the slot empty; for storage,
// the build without the candidate's change)
const severities = (issues: Issue[]) =>
  issues.map((issue) => [issue.rule, issue.severity])

describe("checkCandidate: only what the candidate makes new or worse", () => {
  test("E60: a cooler the board already rejects isn't blamed on the CPU", () => {
    const build = buildOf(seed.proB760mDdr4, seed.nhL9aAm5)
    // Its own issues remain: no GPU yet, and an early B760 BIOS
    expect(rules(checkCandidate(build, "cpu", seed.i5_14400f))).toEqual([
      "integrated-graphics",
      "bios-update",
    ])
  })

  test("E61: a CPU on another socket still gets the socket error", () => {
    const build = buildOf(seed.proB760mDdr4, seed.nhL9aAm5)
    expect(rules(checkCandidate(build, "cpu", seed.ryzen5_7600))).toEqual([
      "socket-match",
    ])
  })

  test("E62: no CPU is blamed for a GPU that already overloads the PSU", () => {
    const build = buildOf(seed.rtx5090Astral, seed.mwe550)
    for (const cpu of seedParts("cpu")) {
      expect(checkCandidate(build, "cpu", cpu)).toEqual([])
    }
  })

  test("E63: a CPU that turns a warning into an error is shown", () => {
    const build = buildOf(seed.rtx5090Astral, seed.rm850e)
    expect(severities(checkCandidate(build, "cpu", seed.ryzen5_7600))).toEqual([
      ["psu-wattage", "error"],
    ])
  })

  test("E64: a warning that stays a warning isn't shown", () => {
    const psu900 = fixturePart("psu", "psu-900", {
      ...seed.mwe550.specs,
      wattageW: 900,
    })
    const build = buildOf(seed.rtx5090Astral, psu900)
    expect(checkCandidate(build, "cpu", seed.ryzen5_7600)).toEqual([])
    expect(
      severities(checkCandidate(build, "cpu", seed.ryzen7_9800x3d))
    ).toEqual([["psu-wattage", "error"]])
  })

  test("E65: CPUs that create a warning or an error", () => {
    const build = buildOf(seed.rtx5090Astral, seed.gx1000)
    const check = (cpu: BuildPart<"cpu">) =>
      severities(checkCandidate(build, "cpu", cpu))
    expect(check(seed.ryzen5_7600)).toEqual([["psu-wattage", "warning"]])
    expect(check(seed.ryzen7_9800x3d)).toEqual([["psu-wattage", "warning"]])
    expect(check(seed.i9_14900k)).toEqual([["psu-wattage", "error"]])
  })

  test("E66: PSU candidates always get their own wattage result", () => {
    const build = buildOf(seed.ryzen7_9800x3d, seed.rtx5090Astral)
    const check = (psu: BuildPart<"psu">) =>
      severities(checkCandidate(build, "psu", psu))
    expect(check(seed.mwe550)).toEqual([["psu-wattage", "error"]])
    expect(check(seed.sf750)).toEqual([["psu-wattage", "error"]])
    expect(check(seed.rm850e)).toEqual([["psu-wattage", "error"]])
    expect(check(seed.gx1000)).toEqual([["psu-wattage", "warning"]])
    expect(check(seed.rm1200x)).toEqual([])
  })

  test("E67: GPU candidates against the PSU", () => {
    const build = buildOf(seed.ryzen7_9800x3d, seed.mwe550)
    const check = (gpu: BuildPart<"gpu">) =>
      severities(checkCandidate(build, "gpu", gpu))
    expect(check(seed.rtx4060)).toEqual([])
    expect(check(seed.rtx5070Sff)).toEqual([["psu-wattage", "warning"]])
    expect(check(seed.rtx5090Astral)).toEqual([["psu-wattage", "error"]])
  })

  test("E68–E70: a drive is judged against the drives it joins", () => {
    const build = swap(buildC(), pro990, sn850x)
    expect(
      checkCandidate(build, "storage", seed.nv3, { replace: sn850x.id })
    ).toEqual([])
    expect(rules(checkCandidate(build, "storage", seed.nv3))).toEqual([
      "m2-slots",
    ])
    expect(checkCandidate(build, "storage", seed.mx500)).toEqual([])
  })

  test("E71: once the M.2 slots are over, more drives aren't blamed", () => {
    const build: Build = {
      ...buildC(),
      storage: [
        { part: pro990, quantity: 2 },
        { part: sn850x, quantity: 1 },
      ],
    }
    expect(checkCandidate(build, "storage", seed.nv3)).toEqual([])
    expect(checkCandidate(build, "storage", seed.mx500)).toEqual([])
  })

  test("E72: boards are judged against the drives already picked", () => {
    const build: Build = {
      ...buildOf(seed.ryzen5_7600),
      storage: [
        { part: pro990, quantity: 2 },
        { part: sn850x, quantity: 1 },
      ],
    }
    expect(
      rules(checkCandidate(build, "motherboard", seed.b650iLightning))
    ).toEqual(["m2-slots"])
    expect(checkCandidate(build, "motherboard", seed.x870eAorus)).toEqual([])
  })

  test("E73: a kit with more sticks than the board has slots", () => {
    const build = buildOf(seed.ryzen5_7600, seed.b650iLightning)
    expect(
      rules(checkCandidate(build, "memory", seed.vengeanceDdr5_4x16))
    ).toEqual(["memory-slots"])
  })

  test("E74: a GPU that fixes a warning reports nothing", () => {
    expect(
      checkCandidate(buildOf(seed.i5_14400f), "gpu", seed.rtx4060)
    ).toEqual([])
  })

  test("E75: a CPU without graphics in an empty build", () => {
    expect(rules(checkCandidate({}, "cpu", seed.i5_14400f))).toEqual([
      "integrated-graphics",
    ])
    expect(checkCandidate({}, "cpu", seed.ryzen5_7600)).toEqual([])
  })
})
