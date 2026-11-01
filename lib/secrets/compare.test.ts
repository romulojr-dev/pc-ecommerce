import { describe, expect, it } from "vitest"

import { bearerOf, secretMatches } from "./compare"

// docs/specs/033-release-unpaid-orders: T1–T3's header cases
const SECRET = "s".repeat(32)

describe("secretMatches", () => {
  it("matches the same secret", () => {
    expect(secretMatches(SECRET, SECRET)).toBe(true)
  })

  it.each([
    ["a different secret of the same length", "t".repeat(32), SECRET],
    ["the secret plus one character", `${SECRET}x`, SECRET],
    ["nothing sent", null, SECRET],
    ["an empty string", "", SECRET],
    ["no secret on the server", SECRET, undefined],
  ])("refuses %s", (_, given, expected) => {
    expect(secretMatches(given, expected)).toBe(false)
  })
})

describe("bearerOf", () => {
  it("reads the token of a Bearer header", () => {
    expect(bearerOf(`Bearer ${SECRET}`)).toBe(SECRET)
  })

  it.each([
    null,
    "",
    "Bearer",
    "Bearer ",
    `Basic ${SECRET}`,
    `bearer ${SECRET}`,
    `Bearer ${SECRET} extra`,
    `Bearer ${SECRET}, Bearer ${SECRET}`,
  ])("refuses %j", (header) => {
    expect(bearerOf(header)).toBeNull()
  })
})
