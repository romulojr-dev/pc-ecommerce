import { createHash } from "node:crypto"

import { describe, expect, it } from "vitest"

import {
  DUMMY_TOKEN_HASH,
  hashCartId,
  hashToken,
  keyShape,
  newAccessToken,
  newIdempotencyKey,
  tokenMatches,
  tokenShape,
} from "./secrets"

// docs/specs/030-place-an-order: U3, U4, U5 and P34's shapes

const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex")

describe("newAccessToken (U3)", () => {
  it("is 43 canonical base64url characters of 32 bytes", () => {
    const token = newAccessToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(token, "base64url")).toHaveLength(32)
    expect(Buffer.from(token, "base64url").toString("base64url")).toBe(token)
    expect(tokenShape(token)).toBe(true)
  })

  it("never repeats", () => {
    expect(new Set(Array.from({ length: 1000 }, newAccessToken)).size).toBe(
      1000
    )
  })

  it("hashes to the SHA-256 hex of itself", () => {
    const token = newAccessToken()
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken(token)).toBe(sha256(token))
  })
})

describe("newIdempotencyKey (U5)", () => {
  it("is 22 canonical base64url characters of 16 bytes", () => {
    const key = newIdempotencyKey()
    expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(Buffer.from(key, "base64url")).toHaveLength(16)
    expect(keyShape(key)).toBe(true)
  })

  it("never repeats", () => {
    expect(new Set(Array.from({ length: 1000 }, newIdempotencyKey)).size).toBe(
      1000
    )
  })
})

describe("the shapes refuse what the server never mints (P34)", () => {
  const key = newIdempotencyKey()
  const token = newAccessToken()
  // The last character of a 22-character key carries only 4 of its 6 bits;
  // "B" decodes to the same 16 bytes as "A" but is not what the encoder writes
  const nonCanonicalKey = key.slice(0, 21) + (key.endsWith("A") ? "B" : "B")
  const nonCanonicalToken = token.slice(0, 42) + "B"

  it.each([
    ["21 characters", key.slice(0, 21)],
    ["23 characters", key + "A"],
    ["a character outside the alphabet", key.slice(0, 21) + "+"],
    ["padding", key + "=="],
    ["a token's length", token],
    ["empty", ""],
    ["a space", key.slice(0, 21) + " "],
  ])("keyShape refuses %s", (_name, value) => {
    expect(keyShape(value)).toBe(false)
  })

  it.each([
    ["42 characters", token.slice(0, 42)],
    ["44 characters", token + "A"],
    ["a key's length", key],
    ["padding", token + "="],
    ["a character outside the alphabet", token.slice(0, 42) + "/"],
  ])("tokenShape refuses %s", (_name, value) => {
    expect(tokenShape(value)).toBe(false)
  })

  it("refuses a last character that isn't canonical", () => {
    // Skip the check when the random draw happens to end in "B" already
    if (key.slice(21) !== "B") expect(keyShape(nonCanonicalKey)).toBe(false)
    if (token.slice(42) !== "B") {
      expect(tokenShape(nonCanonicalToken)).toBe(false)
    }
    // A fixed pair: all zero bits is "AAAA…", and "AAAAAAAAAAAAAAAAAAAAAB"
    // decodes to the same 16 zero bytes
    expect(keyShape("A".repeat(22))).toBe(true)
    expect(keyShape("A".repeat(21) + "B")).toBe(false)
    expect(tokenShape("A".repeat(43))).toBe(true)
    expect(tokenShape("A".repeat(42) + "B")).toBe(false)
  })

  it("refuses what isn't text", () => {
    expect(keyShape(undefined)).toBe(false)
    expect(tokenShape(null)).toBe(false)
    expect(keyShape([key])).toBe(false)
  })
})

describe("tokenMatches (U4)", () => {
  const token = newAccessToken()
  const stored = hashToken(token)

  it("is true for the right token", () => {
    expect(tokenMatches(token, stored)).toBe(true)
  })

  it("is false for a wrong token", () => {
    expect(tokenMatches(newAccessToken(), stored)).toBe(false)
  })

  it("is false, without throwing, for a hash or token of the wrong shape", () => {
    expect(tokenMatches(token, "")).toBe(false)
    expect(tokenMatches(token, "abc")).toBe(false)
    expect(tokenMatches(token, stored + "00")).toBe(false)
    expect(tokenMatches("", stored)).toBe(false)
    expect(tokenMatches(undefined, stored)).toBe(false)
    expect(tokenMatches(token, undefined)).toBe(false)
  })

  it("never matches the dummy hash a missing order is compared with", () => {
    expect(DUMMY_TOKEN_HASH).toMatch(/^[0-9a-f]{64}$/)
    expect(tokenMatches(token, DUMMY_TOKEN_HASH)).toBe(false)
  })
})

describe("hashCartId (U5)", () => {
  it("is SHA-256 hex, and differs for different carts", () => {
    expect(hashCartId("a".repeat(22))).toBe(sha256("a".repeat(22)))
    expect(hashCartId("a".repeat(22))).not.toBe(hashCartId("b".repeat(22)))
  })
})
