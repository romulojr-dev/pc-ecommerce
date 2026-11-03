import { describe, expect, it } from "vitest"

import {
  DEFAULT_EMAIL_FROM,
  emailEnvIssues,
  emailFromSchema,
  emailTransportSchema,
  orderLinkSecretSchema,
} from "./env-schema"

// docs/specs/035-email-foundation-signed-links: E1–E6

const messages = (values: Parameters<typeof emailEnvIssues>[0]) =>
  emailEnvIssues(values).map((i) => `${i.variable} ${i.message}`)

const message = (result: {
  success: boolean
  error?: { issues: { message: string }[] }
}) => result.error?.issues[0]?.message

describe("emailTransportSchema (E1)", () => {
  it("is required", () => {
    expect(message(emailTransportSchema.safeParse(undefined))).toBe(
      "is not set"
    )
  })
  it("accepts only resend or fake", () => {
    expect(message(emailTransportSchema.safeParse("smtp"))).toBe(
      "must be resend or fake"
    )
    expect(emailTransportSchema.safeParse("resend").success).toBe(true)
    expect(emailTransportSchema.safeParse("fake").success).toBe(true)
  })
})

describe("emailEnvIssues", () => {
  it("refuses the fake in production (E2)", () => {
    expect(
      messages({ EMAIL_TRANSPORT: "fake", VERCEL_ENV: "production" })
    ).toEqual(["EMAIL_TRANSPORT must be resend in production"])
    expect(
      messages({ EMAIL_TRANSPORT: "fake", VERCEL_ENV: "preview" })
    ).toEqual([])
  })

  it("needs the key with resend (E3)", () => {
    expect(messages({ EMAIL_TRANSPORT: "resend" })).toEqual([
      "RESEND_API_KEY is not set (required with EMAIL_TRANSPORT=resend)",
    ])
    expect(
      messages({ EMAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_x" })
    ).toEqual([])
  })

  it("does not need the key with the fake", () => {
    expect(messages({ EMAIL_TRANSPORT: "fake" })).toEqual([])
  })
})

describe("orderLinkSecretSchema (E4)", () => {
  it("is required", () => {
    expect(message(orderLinkSecretSchema.safeParse(undefined))).toBe(
      "is not set"
    )
  })
  it("counts UTF-8 bytes, not characters", () => {
    expect(orderLinkSecretSchema.safeParse("a".repeat(31)).success).toBe(false)
    expect(orderLinkSecretSchema.safeParse("a".repeat(32)).success).toBe(true)
    // 16 two-byte characters are 32 bytes; 32 of them are 64
    expect(orderLinkSecretSchema.safeParse("é".repeat(16)).success).toBe(true)
    expect(orderLinkSecretSchema.safeParse("é".repeat(32)).success).toBe(true)
    expect(orderLinkSecretSchema.safeParse("é".repeat(15)).success).toBe(false)
  })
})

describe("emailFromSchema (E5)", () => {
  it("defaults to the store's sender", () => {
    expect(emailFromSchema.parse(undefined)).toBe(DEFAULT_EMAIL_FROM)
    expect(DEFAULT_EMAIL_FROM).toBe("PC Silicon <orders@mail.pcsilicon.tech>")
  })
  it("accepts a bare address and a named one", () => {
    expect(
      emailFromSchema.safeParse("orders@mail.pcsilicon.tech").success
    ).toBe(true)
    expect(emailFromSchema.safeParse("Shop <a@b.co>").success).toBe(true)
  })
  it("refuses anything else", () => {
    expect(message(emailFromSchema.safeParse("not an address"))).toBe(
      'must be an address or "Name <address>"'
    )
  })
})

describe("messages never repeat a value (E6)", () => {
  it("names the variable, not the secret", () => {
    const secret = "short-secret-value"
    const result = orderLinkSecretSchema.safeParse(secret)
    expect(JSON.stringify(result.error?.issues)).not.toContain(secret)
  })
})
