import { describe, expect, test } from "vitest"

import {
  buildA,
  buildB,
  buildC,
  buildOf,
  seed,
  swap,
} from "@/test-support/seed-parts"

import { coolerSocket } from "./cooler-socket"
import { checkRule } from "./rule"

// docs/specs/018-compatibility-rules, E24–E29
describe("cooler socket (error)", () => {
  test("E24: an AM5-only cooler doesn't fit an LGA1700 CPU", () => {
    expect(checkRule(coolerSocket, swap(buildB(), seed.nhL9aAm5))).toEqual({
      rule: "cooler-socket",
      severity: "error",
      parts: [
        { slot: "cpu-cooler", id: "NH-L9a-AM5" },
        { slot: "cpu", id: "BX8071514400F" },
      ],
      message:
        "The Noctua NH-L9a-AM5 Low-Profile Cooler doesn't support the LGA1700 socket of the Intel Core i5-14400F. It supports AM5.",
    })
  })

  test("E25: an Intel-only cooler doesn't fit an AM5 CPU", () => {
    expect(
      checkRule(coolerSocket, buildOf(seed.nhL9i17xx, seed.ryzen5_7600))
        ?.message
    ).toBe(
      "The Noctua NH-L9i-17xx Low-Profile Cooler doesn't support the AM5 socket of the AMD Ryzen 5 7600. It supports LGA1700 and LGA1851."
    )
  })

  test("E26: a supported socket fits", () => {
    expect(
      checkRule(coolerSocket, buildOf(seed.nhL9i17xx, seed.i5_14400f))
    ).toBeNull()
  })

  test("E27: with no CPU, the board's socket is checked", () => {
    expect(
      checkRule(coolerSocket, buildOf(seed.nhL9aAm5, seed.proB760mDdr4))
    ).toEqual({
      rule: "cooler-socket",
      severity: "error",
      parts: [
        { slot: "cpu-cooler", id: "NH-L9a-AM5" },
        { slot: "motherboard", id: "PRO B760M-A WIFI DDR4" },
      ],
      message:
        "The Noctua NH-L9a-AM5 Low-Profile Cooler doesn't support the LGA1700 socket of the MSI PRO B760M-A WiFi DDR4. It supports AM5.",
    })
  })

  test("E28: the CPU wins when CPU and board disagree", () => {
    const issue = checkRule(
      coolerSocket,
      buildOf(seed.i5_14400f, seed.strixB650a, seed.nhL9aAm5)
    )
    expect(issue?.parts[1]).toEqual({ slot: "cpu", id: "BX8071514400F" })
    expect(
      checkRule(
        coolerSocket,
        buildOf(seed.i5_14400f, seed.strixB650a, seed.peerless)
      )
    ).toBeNull()
  })

  test("E29: needs a cooler and a CPU or board", () => {
    expect(checkRule(coolerSocket, buildOf(seed.nhL9aAm5))).toBeNull()
    expect(
      checkRule(coolerSocket, buildOf(seed.nhL9aAm5, seed.ridge))
    ).toBeNull()
  })

  test("spec 001's builds pass", () => {
    for (const build of [buildA(), buildB(), buildC()]) {
      expect(checkRule(coolerSocket, build)).toBeNull()
    }
  })
})
