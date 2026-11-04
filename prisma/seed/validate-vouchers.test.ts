import { describe, expect, it } from "vitest"

import { type VoucherSeed, voucherSeed } from "./data/vouchers"
import { validateVoucherSeed } from "./validate-vouchers"

// docs/specs/037-vouchers-at-checkout, Behavior 2

const one = (overrides: Partial<VoucherSeed>): VoucherSeed => ({
  ...voucherSeed[0],
  ...overrides,
})

describe("the demo vouchers", () => {
  it("pass the validator", () => {
    expect(validateVoucherSeed(voucherSeed)).toEqual([])
  })

  it("are the three the README names", () => {
    expect(voucherSeed.map((v) => v.code)).toEqual([
      "WELCOME10",
      "SAVE500",
      "BUILD5000",
    ])
    expect(voucherSeed.find((v) => v.code === "WELCOME10")).toMatchObject({
      type: "PERCENT",
      value: 10,
      minSpend: 500_000,
    })
    expect(voucherSeed.find((v) => v.code === "SAVE500")).toMatchObject({
      type: "FIXED",
      value: 50_000,
      minSpend: 1_000_000,
    })
    expect(voucherSeed.find((v) => v.code === "BUILD5000")).toMatchObject({
      type: "FIXED",
      value: 500_000,
      minSpend: 5_000_000,
      usageLimit: 100,
    })
  })
})

describe("validateVoucherSeed", () => {
  it.each([
    ["a lower-case code", one({ code: "welcome10" })],
    ["a short code", one({ code: "AB" })],
    ["a percent of 0", one({ value: 0 })],
    ["a percent of 101", one({ value: 101 })],
    ["a fixed amount of 0", one({ type: "FIXED", value: 0 })],
    ["a fraction", one({ type: "FIXED", value: 10.5 })],
    ["a negative minimum spend", one({ minSpend: -1 })],
    ["a usage limit of 0", one({ usageLimit: 0 })],
    ["a start that is not a date", one({ startsAt: "soon" })],
    ["an end before the start", one({ endsAt: "2025-12-31T00:00:00+08:00" })],
  ])("refuses %s", (_, voucher) => {
    expect(validateVoucherSeed([voucher])).not.toEqual([])
  })

  it("refuses the same code twice", () => {
    expect(validateVoucherSeed([voucherSeed[0], voucherSeed[0]])).toEqual([
      expect.stringContaining("appears twice"),
    ])
  })
})
