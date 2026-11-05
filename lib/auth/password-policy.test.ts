import { describe, expect, test } from "vitest"

import { passwordIssue } from "./password-policy"
import { cleanupCutoffs, SIGN_IN_LIMIT, SIGN_IN_PATH } from "./rate-limit"

// docs/specs/039-staff-sign-in-admin-shell, U10, U12

describe("passwordIssue (U10)", () => {
  test("11 characters is refused, 12 is accepted", () => {
    expect(passwordIssue("a".repeat(11))).toBe(
      "The password must be at least 12 characters."
    )
    expect(passwordIssue("a".repeat(12))).toBeNull()
  })

  test("128 is accepted, 129 is refused", () => {
    expect(passwordIssue("a".repeat(128))).toBeNull()
    expect(passwordIssue("a".repeat(129))).toBe(
      "The password must be at most 128 characters."
    )
  })

  test("spaces count and the message never echoes the password", () => {
    expect(passwordIssue("a b c d e f g")).toBeNull()
    expect(passwordIssue("hunter2")).not.toContain("hunter2")
  })
})

describe("cleanupCutoffs (U12)", () => {
  test("sessions expired before now, rate-limit rows older than one hour", () => {
    const now = new Date("2026-11-05T16:00:00.000Z")
    expect(cleanupCutoffs(now)).toEqual({
      sessionCutoff: now,
      rateLimitCutoffMs: now.getTime() - 3_600_000,
    })
  })

  test("the session cutoff is a copy, not the caller's Date", () => {
    const now = new Date("2026-11-05T16:00:00.000Z")
    expect(cleanupCutoffs(now).sessionCutoff).not.toBe(now)
  })
})

describe("the sign-in rule", () => {
  test("3 per 10 seconds on the email sign-in path", () => {
    expect(SIGN_IN_PATH).toBe("/sign-in/email")
    expect(SIGN_IN_LIMIT).toEqual({ window: 10, max: 3 })
  })
})
