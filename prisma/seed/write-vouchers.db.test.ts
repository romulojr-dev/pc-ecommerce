import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { db, resetCatalog } from "@/test-support/db"

import { shippingSeed } from "./data/shipping"
import { voucherSeed } from "./data/vouchers"
import { writeSeed } from "./write"

// The seed's voucher step (docs/specs/037-vouchers-at-checkout, D6, D7). No
// catalog parts are passed, so each run is quick.

const seed = (reset = false) =>
  writeSeed(db, [], { reset, shipping: shippingSeed, vouchers: voucherSeed })

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

describe("the voucher seed", () => {
  it("D6: adds the three demo codes to an empty database", async () => {
    const counts = await seed()

    expect(counts.vouchers).toBe(3)
    const rows = await db.voucher.findMany({ orderBy: { code: "asc" } })
    expect(rows.map((row) => row.code)).toEqual([
      "BUILD5000",
      "SAVE500",
      "WELCOME10",
    ])
    const welcome = rows.find((row) => row.code === "WELCOME10")!
    expect(welcome).toMatchObject({
      type: "PERCENT",
      value: 10,
      minSpend: 500_000,
      endsAt: null,
      usageLimit: null,
      usedCount: 0,
    })
    // 2026-01-01 00:00 Manila
    expect(welcome.startsAt.toISOString()).toBe("2025-12-31T16:00:00.000Z")
  })

  it("D6: a second run changes nothing", async () => {
    await seed()
    const before = await db.voucher.findMany({ orderBy: { code: "asc" } })

    const counts = await seed()

    expect(counts.vouchers).toBe(0)
    expect(await db.voucher.findMany({ orderBy: { code: "asc" } })).toEqual(
      before
    )
  })

  it("D6: keeps what Admin edited and the uses counted", async () => {
    await seed()
    await db.voucher.update({
      where: { code: "WELCOME10" },
      data: { value: 15, usedCount: 7 },
    })

    await seed()

    expect(
      await db.voucher.findUniqueOrThrow({ where: { code: "WELCOME10" } })
    ).toMatchObject({ value: 15, usedCount: 7 })
  })

  it("D6: brings back a deleted code and leaves the others alone", async () => {
    await seed()
    await db.voucher.update({
      where: { code: "WELCOME10" },
      data: { usedCount: 3 },
    })
    await db.voucher.delete({ where: { code: "SAVE500" } })

    const counts = await seed()

    expect(counts.vouchers).toBe(1)
    expect(await db.voucher.count()).toBe(3)
    expect(
      (await db.voucher.findUniqueOrThrow({ where: { code: "WELCOME10" } }))
        .usedCount
    ).toBe(3)
  })

  it("D7: a reset empties the table and fills it again", async () => {
    await seed()
    await db.voucher.update({
      where: { code: "WELCOME10" },
      data: { value: 15, usedCount: 7 },
    })

    const counts = await seed(true)

    expect(counts.vouchers).toBe(3)
    expect(
      await db.voucher.findUniqueOrThrow({ where: { code: "WELCOME10" } })
    ).toMatchObject({ value: 10, usedCount: 0 })
  })

  it("D7: resetCatalog() empties vouchers", async () => {
    await seed()
    await resetCatalog()
    expect(await db.voucher.count()).toBe(0)
  })
})
