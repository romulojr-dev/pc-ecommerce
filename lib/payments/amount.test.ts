import { describe, expect, it } from "vitest"

import { fromProviderAmount, MAX_CENTAVOS, toProviderAmount } from "./amount"

// docs/specs/031-pay-with-xendit: S3, S3a, S3b

describe("toProviderAmount (S3)", () => {
  it.each([
    [6_906_000, "69060"],
    [1_999, "19.99"],
    [2_311_099, "23110.99"],
    [1_149_500, "11495"],
    [100, "1"],
    [2_000, "20"],
    [5, "0.05"],
    [10, "0.1"],
    [101, "1.01"],
    [MAX_CENTAVOS, "9999999999999.99"],
  ])("%i centavos → %s", (centavos, text) => {
    const amount = toProviderAmount(centavos)
    expect(JSON.stringify(amount)).toBe(text)
    expect(JSON.stringify({ amount })).toBe(`{"amount":${text}}`)
  })

  it("round-trips every centavo value from 1 to 100,000", () => {
    for (let centavos = 1; centavos <= 100_000; centavos++) {
      expect(fromProviderAmount(toProviderAmount(centavos))).toBe(centavos)
    }
  })

  it.each([
    0,
    -1,
    19.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    MAX_CENTAVOS + 1,
  ])("refuses %s (S3b)", (centavos) => {
    expect(() => toProviderAmount(centavos)).toThrow(RangeError)
  })
})

describe("fromProviderAmount (S3a)", () => {
  it.each([
    [69060, 6_906_000],
    [19.99, 1_999],
    [0.1, 10],
    [0.05, 5],
    [0, 0],
    [23110.99, 2_311_099],
  ])("%s → %i centavos", (amount, centavos) => {
    expect(fromProviderAmount(amount)).toBe(centavos)
  })

  it.each([
    19.999,
    -1,
    Number.NaN,
    1e21,
    1e13,
    0.001,
    "19.99",
    null,
    undefined,
  ])("refuses %s", (amount) => {
    expect(fromProviderAmount(amount)).toBeNull()
  })
})
