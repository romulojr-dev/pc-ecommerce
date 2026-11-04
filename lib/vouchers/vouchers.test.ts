import { describe, expect, it } from "vitest"

import { checkVoucher, normalizeVoucherCode, voucherDiscount } from "."
import type { VoucherInput } from "./types"

// docs/specs/037-vouchers-at-checkout, U1–U13

const NOW = new Date("2026-11-04T02:00:00Z") // 10:00 Manila

const voucher = (overrides: Partial<VoucherInput> = {}): VoucherInput => ({
  type: "PERCENT",
  value: 10,
  minSpend: 0,
  startsAt: new Date("2026-01-01T00:00:00+08:00"),
  endsAt: null,
  usageLimit: null,
  usedCount: 0,
  ...overrides,
})

describe("voucherDiscount", () => {
  it("U1: percent floors, never rounds up", () => {
    expect(voucherDiscount({ type: "PERCENT", value: 10 }, 199_999)).toBe(
      19_999
    )
  })

  it("U2: percent of a whole-peso subtotal", () => {
    expect(voucherDiscount({ type: "PERCENT", value: 10 }, 2_299_000)).toBe(
      229_900
    )
  })

  it("U3: 100 percent is the subtotal", () => {
    expect(voucherDiscount({ type: "PERCENT", value: 100 }, 2_299_000)).toBe(
      2_299_000
    )
  })

  it("U4: a percent that floors to nothing is 0", () => {
    expect(voucherDiscount({ type: "PERCENT", value: 1 }, 99)).toBe(0)
  })

  it("U5: exact on the largest subtotals", () => {
    expect(
      voucherDiscount({ type: "PERCENT", value: 99 }, 99_999_999_999)
    ).toBe(98_999_999_999)
  })

  it("U6: fixed is capped at the subtotal", () => {
    const fixed = { type: "FIXED" as const, value: 50_000 }
    expect(voucherDiscount(fixed, 579_500)).toBe(50_000)
    expect(voucherDiscount(fixed, 29_000)).toBe(29_000)
    expect(voucherDiscount(fixed, 50_000)).toBe(50_000)
    expect(voucherDiscount(fixed, 0)).toBe(0)
  })

  it("matches floor(subtotal × value / 100) for many values", () => {
    for (let subtotal = 0; subtotal < 5_000; subtotal += 7) {
      for (const value of [1, 7, 10, 33, 50, 99, 100]) {
        expect(voucherDiscount({ type: "PERCENT", value }, subtotal)).toBe(
          Math.floor((subtotal * value) / 100)
        )
      }
    }
  })

  it("throws on input that is a bug in the caller", () => {
    expect(() => voucherDiscount({ type: "PERCENT", value: 10 }, 10.5)).toThrow(
      RangeError
    )
    expect(() => voucherDiscount({ type: "PERCENT", value: 10 }, -1)).toThrow(
      RangeError
    )
    expect(() => voucherDiscount({ type: "PERCENT", value: 101 }, 100)).toThrow(
      RangeError
    )
    expect(() => voucherDiscount({ type: "FIXED", value: 0 }, 100)).toThrow(
      RangeError
    )
    expect(() => voucherDiscount({ type: "FIXED", value: 1.5 }, 100)).toThrow(
      RangeError
    )
  })
})

describe("normalizeVoucherCode", () => {
  it("U7: trims and upper-cases", () => {
    for (const text of [
      " welcome10 ",
      "WelCome10",
      "WELCOME10",
      "\tWELCOME10\n",
    ]) {
      expect(normalizeVoucherCode(text)).toBe("WELCOME10")
    }
  })

  it("keeps underscores and hyphens", () => {
    expect(normalizeVoucherCode("save_500-now")).toBe("SAVE_500-NOW")
  })

  it("U8: anything that can't be a code is null", () => {
    for (const text of [
      "",
      "   ",
      "WELCOME 10",
      "WELCOME10!",
      "ab",
      "A".repeat(33),
      "ＷＥＬＣＯＭＥ10",
      "ı".repeat(4),
      "straße",
      "ﬁle12",
    ]) {
      expect(normalizeVoucherCode(text)).toBeNull()
    }
  })

  it("accepts 3 and 32 characters", () => {
    expect(normalizeVoucherCode("abc")).toBe("ABC")
    expect(normalizeVoucherCode("a".repeat(32))).toBe("A".repeat(32))
  })
})

describe("checkVoucher", () => {
  it("applies an eligible voucher", () => {
    expect(checkVoucher(voucher(), 2_299_000, NOW)).toEqual({
      ok: true,
      discount: 229_900,
    })
  })

  it("no voucher is unknown", () => {
    expect(checkVoucher(null, 100, NOW)).toEqual({
      ok: false,
      reason: "unknown",
    })
  })

  it("U9: startsAt itself is allowed, a millisecond earlier is not", () => {
    expect(checkVoucher(voucher({ startsAt: NOW }), 1_000, NOW).ok).toBe(true)
    expect(
      checkVoucher(
        voucher({ startsAt: new Date(NOW.getTime() + 1) }),
        1_000,
        NOW
      )
    ).toEqual({ ok: false, reason: "not-started" })
  })

  it("U10: endsAt itself has ended, a millisecond later has not", () => {
    expect(checkVoucher(voucher({ endsAt: NOW }), 1_000, NOW)).toEqual({
      ok: false,
      reason: "ended",
    })
    expect(
      checkVoucher(voucher({ endsAt: new Date(NOW.getTime() + 1) }), 1_000, NOW)
        .ok
    ).toBe(true)
  })

  it("U11: the usage limit", () => {
    expect(
      checkVoucher(voucher({ usageLimit: 5, usedCount: 5 }), 1_000, NOW)
    ).toEqual({ ok: false, reason: "used-up" })
    expect(
      checkVoucher(voucher({ usageLimit: 5, usedCount: 4 }), 1_000, NOW).ok
    ).toBe(true)
    expect(
      checkVoucher(voucher({ usageLimit: null, usedCount: 9_999 }), 1_000, NOW)
        .ok
    ).toBe(true)
  })

  it("U12: the minimum spend, at the boundary", () => {
    const v = voucher({ minSpend: 1_000_000 })
    expect(checkVoucher(v, 1_000_000, NOW).ok).toBe(true)
    expect(checkVoucher(v, 999_999, NOW)).toEqual({
      ok: false,
      reason: "min-spend",
      shortBy: 1,
    })
  })

  it("U13: the first failure wins, in the spec's order", () => {
    const past = new Date("2026-01-01T00:00:00Z")
    const future = new Date("2027-01-01T00:00:00Z")
    expect(
      checkVoucher(
        voucher({ endsAt: past, usageLimit: 1, usedCount: 1 }),
        100,
        NOW
      )
    ).toEqual({ ok: false, reason: "ended" })
    expect(
      checkVoucher(voucher({ startsAt: future, minSpend: 1_000_000 }), 100, NOW)
    ).toEqual({ ok: false, reason: "not-started" })
    expect(
      checkVoucher(
        voucher({ usageLimit: 1, usedCount: 1, minSpend: 1_000_000 }),
        100,
        NOW
      )
    ).toEqual({ ok: false, reason: "used-up" })
  })
})
