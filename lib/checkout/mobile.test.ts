import { describe, expect, it } from "vitest"

import { normalizeMobile } from "./mobile"

// Docs: docs/specs/029-checkout-steps, I2a–I2d, I3
const NORMALIZED = "+639171234567"

describe("normalizeMobile", () => {
  it.each([
    "0917 123 4567",
    "09171234567",
    "0917-123-4567",
    "(0917) 123-4567",
    "0917.123.4567",
  ])("takes the 0917… form %s (I2a)", (text) => {
    expect(normalizeMobile(text)).toBe(NORMALIZED)
  })

  it.each([
    "+639171234567",
    "+63 917 123 4567",
    "+63-917-123-4567",
    "+63917 1234567",
  ])("takes the +63917… form %s (I2b)", (text) => {
    expect(normalizeMobile(text)).toBe(NORMALIZED)
  })

  it.each(["639171234567", "63 917 123 4567", "63-917-123-4567"])(
    "takes the 63917… form %s (I2c)",
    (text) => {
      expect(normalizeMobile(text)).toBe(NORMALIZED)
    }
  )

  it.each(["917 123 4567", "9171234567"])(
    "takes the form without the leading 0: %s (I2d)",
    (text) => {
      expect(normalizeMobile(text)).toBe(NORMALIZED)
    }
  )

  it.each([
    "02 8123 4567",
    "0917123456",
    "09171234567 8",
    "08171234567",
    "+1 917 123 4567",
    "+63 817 123 4567",
    "0917abc4567",
    "",
  ])("refuses %j (I3)", (text) => {
    expect(normalizeMobile(text)).toBeNull()
  })
})
