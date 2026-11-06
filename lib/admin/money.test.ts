import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { centavosToPesos, MAX_PRICE_CENTAVOS, pesosToCentavos } from "./money"

const ok = (text: string) => {
  const result = pesosToCentavos(text)
  return result.ok ? result.centavos : result.reason
}

describe("pesosToCentavos", () => {
  it.each([
    ["1299", 129900], // E12
    ["1,299", 129900], // E12a
    ["1,299.50", 129950], // E12b
    ["1299.5", 129950], // E12c
    ["1299.50", 129950],
    ["12,999", 1299900],
    ["  12999  ", 1299900],
    ["0.01", 1],
    ["0.1", 10],
    ["1.00", 100],
    ["19.99", 1999],
    ["4294967.29", 429496729],
    ["007", 700],
    ["5,000,000", MAX_PRICE_CENTAVOS],
    ["5000000.00", MAX_PRICE_CENTAVOS],
  ])("accepts %s", (text, centavos) => {
    expect(ok(text)).toBe(centavos)
  })

  it.each([
    "1299.505", // E12d
    "1.005",
    "",
    "   ",
    "-5",
    "+5",
    "1e3",
    "1299.",
    ".5",
    "1,29",
    "12,99,9",
    ",100",
    "1,2345",
    "₱1299",
    "12 99",
    "abc",
    "1,299,5",
  ])("refuses %j as a bad format", (text) => {
    expect(ok(text)).toBe("format") // E12d, E12e
  })

  it.each(["0", "0.00", "000", "5,000,000.01", "99999999999"])(
    "refuses %s as out of range",
    (text) => {
      expect(ok(text)).toBe("range") // E12g, E12h
    }
  )
})

describe("centavosToPesos", () => {
  it.each([
    [129950, "1299.50"],
    [129900, "1299.00"],
    [1, "0.01"],
    [10, "0.10"],
    [500_000_000, "5000000.00"],
  ])("%d is %s", (centavos, text) => {
    expect(centavosToPesos(centavos)).toBe(text)
    expect(ok(text)).toBe(centavos)
  })
})

describe("the parser source", () => {
  it("never calls a number parser on the text (R5)", () => {
    const source = readFileSync(join(__dirname, "money.ts"), "utf8")
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
    expect(source).not.toMatch(/\bNumber\s*\(/)
    expect(source).not.toMatch(/parseFloat|parseInt|Math\.round/)
  })
})
