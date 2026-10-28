import { describe, expect, test } from "vitest"

import {
  buildA,
  buildB,
  buildC,
  buildOf,
  seed,
  swap,
} from "@/test-support/seed-parts"

import { biosUpdate } from "./bios-update"
import { checkRule } from "./rule"

// docs/specs/018-compatibility-rules, E2, E38–E42
describe("BIOS update (warning)", () => {
  test("E38: a Zen 5 CPU on a board whose launch BIOS supports Zen 4", () => {
    expect(checkRule(biosUpdate, swap(buildA(), seed.ryzen7_9800x3d))).toEqual({
      rule: "bios-update",
      severity: "warning",
      parts: [
        { slot: "cpu", id: "100-100001084WOF" },
        { slot: "motherboard", id: "90MB1BP0-M0AAY0" },
      ],
      message:
        "The ASUS ROG Strix B650-A Gaming WiFi may need a BIOS update to run the AMD Ryzen 7 9800X3D: its launch BIOS supports Zen 4 (Ryzen 7000), not Zen 5 (Ryzen 9000).",
    })
  })

  test("E39: a native generation needs no update", () => {
    expect(
      checkRule(biosUpdate, buildOf(seed.ryzen7_9800x3d, seed.x870eAorus))
    ).toBeNull()
  })

  test("E2, E40: a 14th-gen CPU on an early B760 board", () => {
    const message =
      "The MSI PRO B760M-A WiFi DDR4 may need a BIOS update to run the Intel Core i5-14400F: its launch BIOS supports Alder Lake (12th gen) and Raptor Lake (13th gen), not Raptor Lake Refresh (14th gen)."
    expect(checkRule(biosUpdate, buildB())?.message).toBe(message)
    expect(
      checkRule(biosUpdate, buildOf(seed.i5_14400f, seed.proB760mDdr4))?.message
    ).toBe(message)
  })

  test("E41: the board's own list decides", () => {
    expect(
      checkRule(biosUpdate, buildOf(seed.i5_13400f, seed.proB760mDdr4))
    ).toBeNull()
    expect(
      checkRule(biosUpdate, buildOf(seed.i5_13400f, seed.h610m))?.severity
    ).toBe("warning")
  })

  test("E42: silent when the sockets differ (socket match reports it)", () => {
    expect(
      checkRule(biosUpdate, buildOf(seed.i5_14400f, seed.strixB650a))
    ).toBeNull()
  })

  test("spec 001's builds A and C need no update", () => {
    expect(checkRule(biosUpdate, buildA())).toBeNull()
    expect(checkRule(biosUpdate, buildC())).toBeNull()
  })

  test("needs both a CPU and a board", () => {
    expect(checkRule(biosUpdate, buildOf(seed.ryzen7_9800x3d))).toBeNull()
  })
})
