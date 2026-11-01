import { describe, expect, it } from "vitest"

import {
  type PaymentEnvValues,
  paymentEnvIssues,
  paymentGatewaySchema,
  vercelEnvSchema,
} from "./env-schema"

// docs/specs/031-pay-with-xendit: E1–E7

const TEST_KEY = "xnd_development_abc123"
const LIVE_KEY = "xnd_production_abc123"
const fake: PaymentEnvValues = {
  PAYMENT_GATEWAY: "fake",
  XENDIT_WEBHOOK_TOKEN: "token",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
}
const xendit: PaymentEnvValues = {
  PAYMENT_GATEWAY: "xendit",
  XENDIT_SECRET_KEY: TEST_KEY,
  NEXT_PUBLIC_SITE_URL: "https://pcsilicon.example",
}

const messages = (values: PaymentEnvValues) =>
  paymentEnvIssues(values).map((i) => `${i.variable} ${i.message}`)

describe("paymentEnvIssues", () => {
  it("refuses the fake in production (E1)", () => {
    expect(messages({ ...fake, VERCEL_ENV: "production" })).toEqual([
      "PAYMENT_GATEWAY must be xendit in production",
    ])
  })

  it("needs the key with xendit (E2)", () => {
    expect(messages({ ...xendit, XENDIT_SECRET_KEY: undefined })).toEqual([
      "XENDIT_SECRET_KEY is not set",
    ])
  })

  it.each([
    ["xendit", { ...xendit, XENDIT_SECRET_KEY: LIVE_KEY }],
    ["fake", { ...fake, XENDIT_SECRET_KEY: LIVE_KEY }],
    [
      "fake in preview",
      { ...fake, XENDIT_SECRET_KEY: LIVE_KEY, VERCEL_ENV: "preview" },
    ],
  ])("refuses a live key with %s (E3), never printing it", (_, values) => {
    const found = messages(values)
    expect(found).toEqual([
      "XENDIT_SECRET_KEY must be a test-mode key (xnd_development_…), never a live one",
    ])
    expect(found.join(" ")).not.toContain("abc123")
  })

  it("refuses a key without the test prefix", () => {
    expect(messages({ ...xendit, XENDIT_SECRET_KEY: "sk_test_abc" })).toEqual([
      "XENDIT_SECRET_KEY must be a test-mode key (xnd_development_…)",
    ])
  })

  it("accepts xendit with a test key in production (E4)", () => {
    expect(messages({ ...xendit, VERCEL_ENV: "production" })).toEqual([])
  })

  it("accepts the fake locally (E5)", () => {
    expect(messages(fake)).toEqual([])
  })

  it("needs an https site with xendit (E7)", () => {
    expect(
      messages({ ...xendit, NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })
    ).toEqual(["NEXT_PUBLIC_SITE_URL must be https with the xendit gateway"])
  })

  it("needs the webhook token with the fake", () => {
    expect(messages({ ...fake, XENDIT_WEBHOOK_TOKEN: undefined })).toEqual([
      "XENDIT_WEBHOOK_TOKEN is not set",
    ])
  })
})

describe("PAYMENT_GATEWAY schema (E6)", () => {
  it("accepts xendit and fake", () => {
    expect(paymentGatewaySchema.parse("xendit")).toBe("xendit")
    expect(paymentGatewaySchema.parse("fake")).toBe("fake")
  })

  it("says what's wrong", () => {
    const issue = (value: unknown) =>
      paymentGatewaySchema.safeParse(value).error?.issues[0]?.message
    expect(issue("paypal")).toBe("must be xendit or fake")
    expect(issue("Xendit")).toBe("must be xendit or fake")
    expect(issue(undefined)).toBe("is not set")
  })
})

describe("VERCEL_ENV schema", () => {
  it("allows unset and Vercel's three values", () => {
    for (const value of [undefined, "production", "preview", "development"]) {
      expect(vercelEnvSchema.safeParse(value).success).toBe(true)
    }
    expect(vercelEnvSchema.safeParse("staging").success).toBe(false)
  })
})
