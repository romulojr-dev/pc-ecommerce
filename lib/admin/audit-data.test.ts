import { describe, expect, test } from "vitest"

import {
  auditJsonText,
  isSecretKey,
  MAX_AUDIT_BYTES,
  toAuditJson,
} from "./audit-data"

describe("secret-looking keys", () => {
  test.each([
    "password",
    "sessionToken",
    "access_token",
    "apiKey",
    "api-key",
    "idempotencyKey",
    "passwordHash",
    "Cookie",
    "authorization",
    "signature",
    "sig",
    "XENDIT_SECRET_KEY",
  ])("%s is redacted", (key) => {
    expect(isSecretKey(key)).toBe(true)
  })

  test.each(["sku", "design", "monkey", "status", "price", "keyboardLayout"])(
    "%s is kept",
    (key) => {
      expect(isSecretKey(key)).toBe(false)
    }
  )
})

describe("toAuditJson", () => {
  test("redacts at any depth (E16)", () => {
    expect(
      toAuditJson({
        status: "PAID",
        sessionToken: "abc",
        nested: [{ apiKey: "k", price: 1 }],
      })
    ).toEqual({
      status: "PAID",
      sessionToken: "[redacted]",
      nested: [{ apiKey: "[redacted]", price: 1 }],
    })
  })

  test("dates become ISO text and undefined is dropped", () => {
    expect(
      toAuditJson({ at: new Date("2026-11-05T01:02:03Z"), gone: undefined })
    ).toEqual({ at: "2026-11-05T01:02:03.000Z" })
  })

  test("values that are not JSON are an error", () => {
    expect(() => toAuditJson({ n: BigInt(10) })).toThrow()
    expect(() => toAuditJson({ n: NaN })).toThrow()
    expect(() => toAuditJson({ f: () => 1 })).toThrow()
  })
})

describe("auditJsonText", () => {
  test("no value is null", () => {
    expect(auditJsonText(undefined)).toBeNull()
    expect(auditJsonText(null)).toBeNull()
  })

  test("over the cap is an error", () => {
    expect(() => auditJsonText({ note: "x".repeat(MAX_AUDIT_BYTES) })).toThrow(
      "too large"
    )
    expect(auditJsonText({ note: "x".repeat(1000) })).toContain("xxx")
  })
})
