import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { db, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"

// What the database itself guarantees for vouchers (docs/specs/037-vouchers-
// at-checkout): D1–D5. Whatever the app does, these hold.

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

const STARTS = new Date("2026-01-01T00:00:00+08:00")

const voucherData = (overrides: Record<string, unknown> = {}) =>
  ({
    code: "WELCOME10",
    type: "PERCENT",
    value: 10,
    startsAt: STARTS,
    ...overrides,
  }) as Parameters<typeof db.voucher.create>[0]["data"]

describe("a voucher row", () => {
  it("starts with a minimum spend of 0, no end, no limit and 0 uses", async () => {
    const voucher = await db.voucher.create({ data: voucherData() })
    expect(voucher).toMatchObject({
      minSpend: 0,
      endsAt: null,
      usageLimit: null,
      usedCount: 0,
    })
  })

  it.each([
    ["a lower-case code", { code: "welcome10" }],
    ["a code with a space", { code: "WELCOME 10" }],
    ["a 2-character code", { code: "AB" }],
    ["a 33-character code", { code: "A".repeat(33) }],
    ["a percent of 0", { value: 0 }],
    ["a percent of 101", { value: 101 }],
    ["a fixed amount of 0", { type: "FIXED", value: 0 }],
    ["a fixed amount below 0", { type: "FIXED", value: -1 }],
    ["a negative minimum spend", { minSpend: -1 }],
    ["a usage limit of 0", { usageLimit: 0 }],
    ["a negative count", { usedCount: -1 }],
    ["a count above the limit", { usageLimit: 5, usedCount: 6 }],
    ["an end that is not after the start", { endsAt: STARTS }],
    ["an end before the start", { endsAt: new Date("2025-12-31T00:00:00Z") }],
  ])("D1/D2: refuses %s", async (_name, change) => {
    await expect(
      db.voucher.create({ data: voucherData(change) })
    ).rejects.toThrow()
  })

  it("accepts the boundaries", async () => {
    await db.voucher.createMany({
      data: [
        voucherData({ code: "ONE", value: 1 }),
        voucherData({ code: "HUNDRED", value: 100 }),
        voucherData({ code: "FIXED1", type: "FIXED", value: 1 }),
        voucherData({ code: "A".repeat(32) }),
        voucherData({ code: "LAST_ONE-1", usageLimit: 1, usedCount: 1 }),
        voucherData({
          code: "ENDS",
          endsAt: new Date(STARTS.getTime() + 1),
        }),
      ],
    })
    expect(await db.voucher.count()).toBe(6)
  })

  it("D3: refuses a second row with the same code", async () => {
    await db.voucher.create({ data: voucherData() })
    await expect(
      db.voucher.create({ data: voucherData({ value: 20 }) })
    ).rejects.toThrow()
  })

  it("refuses a count that goes above the limit in an update", async () => {
    const voucher = await db.voucher.create({
      data: voucherData({ usageLimit: 1, usedCount: 1 }),
    })
    await expect(
      db.voucher.update({
        where: { id: voucher.id },
        data: { usedCount: { increment: 1 } },
      })
    ).rejects.toThrow()
  })
})

describe("an order's voucher columns", () => {
  const withVoucher = async () =>
    db.voucher.create({ data: voucherData({ type: "FIXED", value: 100_000 }) })

  it("D4: refuses a discount above the subtotal", async () => {
    const voucher = await withVoucher()
    await expect(
      db.order.create({
        data: orderData({
          subtotal: 2_299_000,
          discount: 2_299_001,
          total: 12_000 - 1,
          voucherId: voucher.id,
          voucherCode: voucher.code,
        }),
      })
    ).rejects.toThrow()
  })

  it("accepts a discount equal to the subtotal", async () => {
    const voucher = await withVoucher()
    await db.order.create({
      data: orderData({
        subtotal: 2_299_000,
        discount: 2_299_000,
        total: 12_000,
        voucherId: voucher.id,
        voucherCode: voucher.code,
      }),
    })
  })

  it("D4: refuses a discount with no voucher", async () => {
    await expect(
      db.order.create({
        data: orderData({ discount: 100_000, total: 2_211_000 }),
      })
    ).rejects.toThrow()
  })

  it("D4: refuses a code without an id, and an id without a code", async () => {
    const voucher = await withVoucher()
    await expect(
      db.order.create({ data: orderData({ voucherCode: "WELCOME10" }) })
    ).rejects.toThrow()
    await expect(
      db.order.create({ data: orderData({ voucherId: voucher.id }) })
    ).rejects.toThrow()
  })

  it("accepts a voucher with a discount of 0", async () => {
    const voucher = await withVoucher()
    await db.order.create({
      data: orderData({ voucherId: voucher.id, voucherCode: voucher.code }),
    })
  })

  it("D5: a voucher an order points at can't be deleted", async () => {
    const voucher = await withVoucher()
    await db.order.create({
      data: orderData({ voucherId: voucher.id, voucherCode: voucher.code }),
    })
    await expect(
      db.voucher.delete({ where: { id: voucher.id } })
    ).rejects.toThrow()
    expect(await db.voucher.count()).toBe(1)
  })
})
