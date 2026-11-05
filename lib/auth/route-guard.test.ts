import { describe, expect, test } from "vitest"

import { isAllowedAuthRequest } from "./route-guard"

// docs/specs/039-staff-sign-in-admin-shell, I4 (the pure half)

describe("isAllowedAuthRequest", () => {
  test.each([
    ["POST", "/api/auth/sign-in/email"],
    ["POST", "/api/auth/sign-out"],
    ["GET", "/api/auth/get-session"],
    ["POST", "/api/auth/get-session"],
    ["post", "/api/auth/sign-in/email"],
  ])("%s %s is allowed", (method, path) => {
    expect(isAllowedAuthRequest(method, path)).toBe(true)
  })

  test.each([
    ["GET", "/api/auth/sign-in/email"],
    ["GET", "/api/auth/sign-out"],
    ["PUT", "/api/auth/get-session"],
    ["POST", "/api/auth/sign-up/email"],
    ["POST", "/api/auth/change-password"],
    ["POST", "/api/auth/update-user"],
    ["GET", "/api/auth/list-sessions"],
    ["GET", "/api/auth/ok"],
    ["GET", "/api/auth/callback/google"],
    ["POST", "/api/auth/callback/google"],
    ["GET", "/api/auth/reset-password/abc"],
    ["POST", "/api/auth/sign-in/email/"],
    ["POST", "/api/auth//sign-in/email"],
    ["POST", "/api/auth/SIGN-IN/EMAIL"],
    ["POST", "/api/auth/sign-in/%65mail"],
    ["POST", "/api/auth/sign-in/email/extra"],
    ["POST", "/api/auth/__proto__"],
    ["POST", "/api/auth/constructor"],
    ["POST", "/api/auth"],
    ["POST", "/api/auth/"],
    ["POST", "/sign-in/email"],
    ["POST", "/api/authx/sign-in/email"],
  ])("%s %s is refused", (method, path) => {
    expect(isAllowedAuthRequest(method, path)).toBe(false)
  })
})
