import { describe, expect, it } from "vitest"

import { normalizeRecipient, recipientHash } from "./recipient"

// docs/specs/035-email-foundation-signed-links: R1, R2, R2a, R2b

const hash = recipientHash("ana.reyes@example.com")

describe("recipientHash", () => {
  it("is 64 hex characters", () => {
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("folds case and surrounding space (R1)", () => {
    for (const address of [
      "Ana.Reyes@Example.com",
      " ana.reyes@example.com ",
      "ANA.REYES@EXAMPLE.COM\n",
    ]) {
      expect(recipientHash(address)).toBe(hash)
    }
  })

  it("drops a +tag from the local part (R2)", () => {
    for (const address of [
      "ana.reyes+promo@example.com",
      "Ana.Reyes+a+b@Example.com",
      " ana.reyes+@example.com ",
    ]) {
      expect(recipientHash(address)).toBe(hash)
    }
  })

  it("never folds dots, digits or the domain (R2a)", () => {
    const others = [
      "ana.reyes2@example.com",
      "anareyes@example.com",
      "ana.reyes+1@example.org",
      "ana.reyes@sub.example.com",
    ].map(recipientHash)
    expect(new Set([hash, ...others]).size).toBe(5)
  })

  it("does not throw on odd input (R2b)", () => {
    expect(normalizeRecipient("+promo@example.com")).toBe("+promo@example.com")
    expect(normalizeRecipient(" Plain ")).toBe("plain")
    expect(normalizeRecipient("a@b@c.com")).toBe("a@b@c.com")
    expect(normalizeRecipient("a+x@b@c.com")).toBe("a@c.com")
  })
})
