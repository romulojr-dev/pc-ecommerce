import { describe, expect, it } from "vitest"

import type { ReconcileOutcome } from "@/lib/payments/outcome"

import { isDue, releaseDecision, type SessionCheck } from "./release-rules"

// docs/specs/033-release-unpaid-orders: E1–E6 and D1–D9
const EXPIRES = new Date("2026-11-02T07:00:00Z")
const pending = {
  status: "PENDING_PAYMENT" as const,
  expiresAt: EXPIRES,
  flagged: false,
}

describe("isDue", () => {
  it.each([
    ["E1", "2026-11-02T06:59:59.999Z", false],
    ["E2", "2026-11-02T07:00:00.000Z", true],
    ["E3", "2026-11-02T07:00:00.001Z", true],
  ])("%s: at %s → %s", (_, now, due) => {
    expect(isDue(pending, new Date(now))).toBe(due)
  })

  it.each([
    "PAID",
    "COD_CONFIRMED",
    "PROCESSING",
    "SHIPPED",
    "READY_FOR_PICKUP",
    "DELIVERED",
    "PICKED_UP",
    "CANCELLED",
    "REFUNDED",
  ] as const)("E4: a %s order is never due", (status) => {
    expect(
      isDue({ ...pending, status }, new Date("2026-11-03T00:00:00Z"))
    ).toBe(false)
  })

  it.each([
    ["2026-11-02T06:59:59.999Z", false],
    ["2026-11-02T07:00:00.000Z", true],
  ])("U13: a Pending confirmation order at %s → due %s", (now, due) => {
    expect(
      isDue({ ...pending, status: "PENDING_CONFIRMATION" }, new Date(now))
    ).toBe(due)
  })

  it("U13: a COD confirmed order is not due, however late", () => {
    expect(
      isDue(
        { ...pending, status: "COD_CONFIRMED" },
        new Date("2027-11-02T07:00:00Z")
      )
    ).toBe(false)
  })

  it("E5: an order with a payment that needs checking is never due", () => {
    expect(
      isDue({ ...pending, flagged: true }, new Date("2026-11-03T00:00:00Z"))
    ).toBe(false)
  })

  it("E6: compares instants, whatever the time zone", () => {
    // The same instant written with Manila's offset
    expect(isDue(pending, new Date("2026-11-02T15:00:00+08:00"))).toBe(true)
  })
})

const cancelled: SessionCheck = { kind: "cancelled" }
const reconciled = (outcome: ReconcileOutcome): SessionCheck => ({
  kind: "reconciled",
  outcome,
})

describe("releaseDecision", () => {
  it.each<[string, SessionCheck[]]>([
    ["D1 no open session", []],
    ["D2 cancelled", [cancelled]],
    ["D3 ended, reconciled expired", [reconciled("expired")]],
    ["D4 ended, already applied", [reconciled("already-applied")]],
  ])("%s → release", (_, checks) => {
    expect(releaseDecision(checks)).toEqual({ release: true })
  })

  it.each<[string, SessionCheck[], string]>([
    ["D5 paid before the cancel", [reconciled("paid")], "paid"],
    ["D6 a mismatch", [reconciled("mismatch")], "mismatch"],
    ["D7 cancel timed out", [{ kind: "failed", code: "timeout" }], "timeout"],
    ["D7 cancel failed", [{ kind: "failed", code: "http-500" }], "http-500"],
    ["D9 one of two can't say", [cancelled, reconciled("retry")], "retry"],
  ])("%s → not released, %s", (_, checks, code) => {
    expect(releaseDecision(checks)).toEqual({ release: false, code })
  })

  it.each<ReconcileOutcome>([
    "retry",
    "not-yet",
    "unconfirmed",
    "error",
    "active",
    "ignored-unknown",
    "ignored-environment",
  ])("D8: %s skips the order", (outcome) => {
    expect(releaseDecision([reconciled(outcome)])).toEqual({
      release: false,
      code: outcome,
    })
  })
})
