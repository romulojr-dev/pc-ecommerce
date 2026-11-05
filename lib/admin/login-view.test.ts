import { describe, expect, test } from "vitest"

import { roleLabel } from "./copy"
import { retrySeconds, signInFailureText, validateLogin } from "./login-view"

// docs/specs/039-staff-sign-in-admin-shell, Rule 31, §5

describe("validateLogin", () => {
  test("both empty", () => {
    expect(validateLogin({ email: "", password: "" })).toEqual({
      email: "Enter your email.",
      password: "Enter your password.",
    })
  })

  test("a blank email is empty; a password of spaces is not", () => {
    expect(validateLogin({ email: "   ", password: "  " })).toEqual({
      email: "Enter your email.",
    })
  })

  test("both given: no errors", () => {
    expect(validateLogin({ email: "a@example.com", password: "x" })).toEqual({})
  })
})

describe("signInFailureText", () => {
  test("a wrong password (401) says the generic line", () => {
    expect(signInFailureText(401, null)).toBe("Email or password is incorrect.")
  })

  test("rate limited (429) names the seconds from the retry delay", () => {
    expect(signInFailureText(429, "7")).toBe(
      "Too many sign-in attempts. Wait 7 seconds and try again."
    )
    expect(signInFailureText(429, "1")).toBe(
      "Too many sign-in attempts. Wait 1 second and try again."
    )
  })

  test("a missing or odd retry delay falls back to the 10-second window", () => {
    for (const header of [null, undefined, "", "abc", "0", "-3", "NaN"]) {
      expect(signInFailureText(429, header), String(header)).toContain(
        "Wait 10 seconds"
      )
    }
  })

  test("anything else is the failure line", () => {
    for (const status of [undefined, 0, 500, 502, 403]) {
      expect(signInFailureText(status, null)).toBe(
        "Couldn't sign in. Try again."
      )
    }
  })
})

describe("retrySeconds", () => {
  test("rounds up and caps at an hour", () => {
    expect(retrySeconds("2.1")).toBe(3)
    expect(retrySeconds("999999")).toBe(3600)
  })
})

describe("roleLabel", () => {
  test("the three labels", () => {
    expect(roleLabel("OWNER")).toBe("Owner")
    expect(roleLabel("STAFF")).toBe("Staff")
    expect(roleLabel("DEMO")).toBe("Demo (read-only)")
  })
})
