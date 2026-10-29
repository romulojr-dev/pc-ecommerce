import { describe, expect, test } from "vitest"

import type { Build, BuildItem, BuildPart, Slot } from "@/lib/builder"
import { ruleSpecsOf } from "@/lib/specs"
import { buildA, buildOf, seed, seedParts } from "@/test-support/seed-parts"

import { decideAdd, type LoadStatus, replaceNote } from "./add-decision"
import { type Fit, fitOf, type FitPart } from "./fit"
import { type AddPlan, planAdd } from "./plan-add"

// What Add to build does on the product page
// (docs/specs/024-add-anyway-product-page, E1–E16), with real seed parts
// against Build A unless said. The decision only reads the fit, the plan and
// the load status, so stock and whether a part is buyable don't matter here.

function fitPart(part: BuildPart): FitPart {
  return {
    id: part.id,
    slot: part.category,
    name: part.name,
    ruleSpecs: ruleSpecsOf(part.category, part.specs),
  }
}

const named = (slot: Slot, name: string): BuildPart => {
  const part = seedParts(slot).find((candidate) => candidate.name === name)
  if (!part) throw new Error(`no ${slot} named ${name} in the seed`)
  return part
}

const msi = seed.proB760mDdr4
const asrock = named("motherboard", "ASRock B650M-HDV/M.2")

// The saved items of a build, as the store holds them
const itemsOf = (build: Build): BuildItem[] =>
  Object.entries(build).flatMap(([slot, entries]) =>
    (entries ?? []).map(({ part, quantity }) => ({
      slot: slot as Slot,
      productId: part.id,
      quantity,
    }))
  )

// What the page does on a click: the fit from the loaded build, the plan from
// the saved items
function decide(
  build: Build,
  part: BuildPart,
  { status = "ready", stock = 10 }: { status?: LoadStatus; stock?: number } = {}
) {
  const fit = status === "ready" ? fitOf(build, fitPart(part)) : null
  const plan = planAdd(itemsOf(build), {
    slot: part.category,
    productId: part.id,
    stock,
  })
  return decideAdd({ status, fit, plan })
}

const withVengeance = (quantity: number): Build => ({
  ...buildA(),
  memory: [{ part: seed.vengeanceDdr5, quantity }],
})

describe("decideAdd, a part that doesn't fit", () => {
  test("asks once when it also replaces the motherboard (E1)", () => {
    const decision = decide(buildA(), msi)
    expect(decision.kind).toBe("ask")
    if (decision.kind !== "ask") return
    expect(decision.errors.map((issue) => issue.message)).toEqual([
      "The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4.",
      "The Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30 is DDR5 memory, but the MSI PRO B760M-A WiFi DDR4 takes DDR4.",
    ])
    expect(decision.replaces).toEqual({ quantity: 1 })
  })

  test("asks with no replace in an empty slot (E4)", () => {
    const decision = decide(buildOf(seed.ryzen5_7600), msi)
    expect(decision.kind).toBe("ask")
    if (decision.kind !== "ask") return
    expect(decision.errors.map((issue) => issue.message)).toEqual([
      "The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4.",
    ])
    expect(decision.replaces).toBeNull()
  })

  test("a memory kit replaces keeping the saved quantity (E5)", () => {
    const kingston = seed.furyDdr4
    for (const quantity of [1, 2]) {
      const decision = decide(withVengeance(quantity), kingston, { stock: 15 })
      expect(decision.kind).toBe("ask")
      if (decision.kind !== "ask") continue
      expect(decision.errors.map((issue) => issue.message)).toEqual([
        "The Kingston FURY Beast DDR4-3200 16 GB (2×8 GB) CL16 is DDR4 memory, but the ASUS ROG Strix B650-A Gaming WiFi takes DDR5.",
      ])
      expect(decision.replaces).toEqual({ quantity })
    }
  })

  test("lists the errors only, not the warnings (E14)", () => {
    // Spec 023 E7: the socket error, then the PSU wattage warning
    const fit = fitOf(buildA(), fitPart(seed.ultra7_265k))
    expect(fit.kind).toBe("errors")
    expect(
      "issues" in fit && fit.issues.map((issue) => issue.severity)
    ).toEqual(["error", "warning"])

    const decision = decide(buildA(), seed.ultra7_265k)
    expect(decision.kind).toBe("ask")
    if (decision.kind !== "ask") return
    expect(decision.errors.map((issue) => issue.severity)).toEqual(["error"])
    expect(decision.errors[0].rule).toBe("socket-match")
  })
})

describe("decideAdd, everything else adds as today", () => {
  test("a part that fits replaces through today's dialog (E6)", () => {
    expect(decide(buildA(), asrock)).toEqual({ kind: "apply" })
  })

  test("a part with warnings isn't asked about (E7)", () => {
    const fit = fitOf(buildA(), fitPart(seed.ryzen7_9800x3d))
    expect(fit.kind).toBe("warnings")
    expect(decide(buildA(), seed.ryzen7_9800x3d)).toEqual({ kind: "apply" })
  })

  test("a warning in an empty slot is added at once (E8)", () => {
    expect(decide(buildOf(seed.strixB650a), seed.ryzen7_9800x3d)).toEqual({
      kind: "apply",
    })
  })

  test("a part with nothing to compare it with (E9, E12)", () => {
    expect(decide(buildOf(seed.mx500), seed.ryzen5_7600)).toEqual({
      kind: "apply",
    })
    expect(decide({}, msi)).toEqual({ kind: "apply" })
  })

  test("a part already in the build never asks (E10, E11, D2, D6)", () => {
    expect(decide(buildA(), seed.strixB650a)).toEqual({ kind: "apply" })
    expect(decide(buildA(), seed.vengeanceDdr5, { stock: 25 })).toEqual({
      kind: "apply",
    })
  })
})

describe("decideAdd, a change that does nothing never asks (E13, D4)", () => {
  const issue = {
    rule: "m2-slots" as const,
    severity: "error" as const,
    parts: [],
    message: "A made-up error",
  }
  // A made-up fit: no seed drive reads "Doesn't fit" (m2-slots is a warning)
  const errors: Fit = { kind: "errors", issues: [issue] }

  test.each<[string, AddPlan]>([
    ["build full", { kind: "full" }],
    ["already in the build", { kind: "already" }],
    ["at stock", { kind: "at-stock", stock: 5 }],
    ["a raise", { kind: "raise", quantity: 2 }],
  ])("%s", (_, plan) => {
    expect(decideAdd({ status: "ready", fit: errors, plan })).toEqual({
      kind: "apply",
    })
  })

  test("an add and a replace do ask, with the same fit", () => {
    expect(
      decideAdd({ status: "ready", fit: errors, plan: { kind: "add" } }).kind
    ).toBe("ask")
    expect(
      decideAdd({
        status: "ready",
        fit: errors,
        plan: { kind: "confirm-replace", quantity: 3 },
      })
    ).toEqual({ kind: "ask", errors: [issue], replaces: { quantity: 3 } })
  })
})

describe("decideAdd, while the build loads", () => {
  test("a click waits, then the same inputs decide (E15)", () => {
    expect(decide(buildA(), msi, { status: "loading" })).toEqual({
      kind: "wait",
    })
    expect(decide(buildA(), msi, { status: "ready" }).kind).toBe("ask")
    expect(decide(buildA(), asrock, { status: "loading" }).kind).toBe("wait")
    expect(decide(buildA(), asrock, { status: "ready" }).kind).toBe("apply")
  })

  test("a failed load adds without asking (E16)", () => {
    expect(decide(buildA(), msi, { status: "error" })).toEqual({
      kind: "apply",
    })
  })
})

describe("replaceNote", () => {
  test("names the slot noun (E1)", () => {
    expect(replaceNote("motherboard", 1)).toBe(
      "This also replaces the motherboard you picked."
    )
    expect(replaceNote("cpu", 1)).toBe("This also replaces the CPU you picked.")
  })

  test("memory above one kit says what it keeps (E5)", () => {
    expect(replaceNote("memory", 1)).toBe(
      "This also replaces the memory you picked."
    )
    expect(replaceNote("memory", 2)).toBe(
      "This also replaces the memory you picked, keeping 2 kits."
    )
  })
})
