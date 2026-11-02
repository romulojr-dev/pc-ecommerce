import { describe, expect, it } from "vitest"

import {
  attemptState,
  OPENING_ABANDONED_AFTER_MS,
  START_PATH_BUDGET_MS,
} from "./attempt"

// docs/specs/034-start-payment-outside-transaction, U1–U5

const created = new Date("2026-11-01T08:00:00.000Z")
const at = (iso: string) => new Date(iso)

describe("attemptState", () => {
  it("keeps an opening attempt fresh under 60 s (U1)", () => {
    expect(
      attemptState(
        { status: "OPENING", createdAt: created },
        at("2026-11-01T08:00:59.999Z")
      )
    ).toBe("opening")
  })

  it("counts an opening attempt of exactly 60 s as abandoned (U2)", () => {
    expect(
      attemptState(
        { status: "OPENING", createdAt: created },
        at("2026-11-01T08:01:00.000Z")
      )
    ).toBe("abandoned")
  })

  it("never abandons an attempt created after now (U3)", () => {
    expect(
      attemptState(
        { status: "OPENING", createdAt: created },
        at("2026-11-01T07:59:00.000Z")
      )
    ).toBe("opening")
  })

  it.each([
    ["PENDING", "pending"],
    ["PAID", "paid"],
    ["EXPIRED", "expired"],
    ["FAILED", "failed"],
  ] as const)("reads %s as %s at any age (U4)", (status, state) => {
    for (const now of [created, at("2027-01-01T00:00:00Z")]) {
      expect(attemptState({ status, createdAt: created }, now)).toBe(state)
    }
  })
})

describe("the abandonment window (U5)", () => {
  it("is 60 s", () => {
    expect(OPENING_ABANDONED_AFTER_MS).toBe(60_000)
  })

  it("is at least twice the longest live start", () => {
    // Claim wait, close, read, create, attach wait
    expect(START_PATH_BUDGET_MS).toBe(28_000)
    expect(START_PATH_BUDGET_MS * 2).toBeLessThanOrEqual(
      OPENING_ABANDONED_AFTER_MS
    )
  })
})
