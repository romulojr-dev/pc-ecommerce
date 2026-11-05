import { describe, expect, test } from "vitest"

import {
  authEnvIssues,
  betterAuthSecretSchema,
  demoAccountPasswordSchema,
  vercelHostSchema,
} from "./env-schema"

// docs/specs/039-staff-sign-in-admin-shell, U3, U3b

const secret = (bytes: number) => "s".repeat(bytes)

describe("betterAuthSecretSchema (U3)", () => {
  test("31 bytes is refused, 32 is accepted", () => {
    expect(betterAuthSecretSchema.safeParse(secret(31)).success).toBe(false)
    expect(betterAuthSecretSchema.safeParse(secret(32)).success).toBe(true)
  })

  test("counts bytes, not characters", () => {
    // 16 two-byte characters are 32 bytes
    expect(betterAuthSecretSchema.safeParse("é".repeat(16)).success).toBe(true)
    expect(betterAuthSecretSchema.safeParse("é".repeat(15)).success).toBe(false)
  })

  test("unset says so, and no message repeats the value", () => {
    const unset = betterAuthSecretSchema.safeParse(undefined)
    expect(unset.success).toBe(false)
    if (!unset.success)
      expect(unset.error.issues[0]!.message).toBe("is not set")

    const short = betterAuthSecretSchema.safeParse("hunter2")
    if (!short.success) {
      expect(short.error.issues[0]!.message).not.toContain("hunter2")
      expect(short.error.issues[0]!.message).toBe("must be at least 32 bytes")
    }
  })
})

describe("authEnvIssues", () => {
  test("equal to ORDER_LINK_SECRET is an issue on BETTER_AUTH_SECRET (U3)", () => {
    expect(
      authEnvIssues({
        BETTER_AUTH_SECRET: secret(40),
        ORDER_LINK_SECRET: secret(40),
      })
    ).toEqual([
      {
        variable: "BETTER_AUTH_SECRET",
        message: "must differ from ORDER_LINK_SECRET",
      },
    ])
  })

  test("different secrets are fine", () => {
    expect(
      authEnvIssues({
        BETTER_AUTH_SECRET: secret(40),
        ORDER_LINK_SECRET: "o".repeat(40),
      })
    ).toEqual([])
  })

  test("the issue message never repeats the secret", () => {
    const [issue] = authEnvIssues({
      BETTER_AUTH_SECRET: secret(40),
      ORDER_LINK_SECRET: secret(40),
    })
    expect(issue!.message).not.toContain(secret(40))
  })
})

describe("VERCEL_URL on a Preview (U3b)", () => {
  const base = {
    BETTER_AUTH_SECRET: secret(40),
    ORDER_LINK_SECRET: "o".repeat(40),
  }

  test("preview with both hosts: ok", () => {
    expect(
      authEnvIssues({
        ...base,
        VERCEL_ENV: "preview",
        VERCEL_URL: "a.vercel.app",
      })
    ).toEqual([])
  })

  test("preview with VERCEL_URL and no VERCEL_BRANCH_URL: ok (it isn't checked)", () => {
    expect(
      authEnvIssues({
        ...base,
        VERCEL_ENV: "preview",
        VERCEL_URL: "a.vercel.app",
      })
    ).toEqual([])
  })

  test("preview without VERCEL_URL: an issue naming VERCEL_URL", () => {
    const issues = authEnvIssues({ ...base, VERCEL_ENV: "preview" })
    expect(issues).toHaveLength(1)
    expect(issues[0]!.variable).toBe("VERCEL_URL")
    expect(issues[0]!.message).toContain(
      "Enable access to System Environment Variables"
    )
  })

  test("production, development and unset need neither", () => {
    expect(authEnvIssues({ ...base, VERCEL_ENV: "production" })).toEqual([])
    expect(authEnvIssues({ ...base, VERCEL_ENV: "development" })).toEqual([])
    expect(authEnvIssues({ ...base })).toEqual([])
  })
})

describe("demoAccountPasswordSchema (U3b)", () => {
  test("unset is allowed", () => {
    expect(demoAccountPasswordSchema.safeParse(undefined).success).toBe(true)
  })

  test("11 characters is refused, 12 is accepted", () => {
    expect(demoAccountPasswordSchema.safeParse("a".repeat(11)).success).toBe(
      false
    )
    expect(demoAccountPasswordSchema.safeParse("a".repeat(12)).success).toBe(
      true
    )
  })

  test("the refusal says why and doesn't echo the value", () => {
    const result = demoAccountPasswordSchema.safeParse("short")
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]!.message).toBe(
        "must be at least 12 characters"
      )
    }
  })
})

describe("vercelHostSchema", () => {
  test("optional", () => {
    expect(vercelHostSchema.safeParse(undefined).success).toBe(true)
    expect(vercelHostSchema.safeParse("a.vercel.app").success).toBe(true)
  })
})
