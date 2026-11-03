import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { db, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"

import { recipientHash } from "./recipient"

// What the database itself guarantees for the email tables (docs/specs/035-
// email-foundation-signed-links, §6 Schema; O15, O16). Whatever the app does,
// these hold.

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

const HASH = recipientHash("ana@example.com")
const newOrder = () => db.order.create({ data: orderData() })

const row = (
  orderId: string,
  overrides: Partial<Parameters<typeof db.emailOutbox.create>[0]["data"]> = {}
) =>
  ({
    orderId,
    type: "ORDER_PLACED",
    recipientHash: HASH,
    ...overrides,
  }) as Parameters<typeof db.emailOutbox.create>[0]["data"]

describe("one email of each type per order", () => {
  it("refuses a second row for the same order and type", async () => {
    const order = await newOrder()
    await db.emailOutbox.create({ data: row(order.id) })
    await expect(
      db.emailOutbox.create({ data: row(order.id) })
    ).rejects.toThrow()
  })

  it("allows other types for the order, and the type for other orders", async () => {
    const [a, b] = [await newOrder(), await newOrder()]
    await db.emailOutbox.create({ data: row(a.id) })
    await db.emailOutbox.create({
      data: row(a.id, { type: "ORDER_CANCELLED" }),
    })
    await db.emailOutbox.create({ data: row(b.id) })
    expect(await db.emailOutbox.count()).toBe(3)
  })
})

describe("CHECKs", () => {
  it("refuses negative attempts", async () => {
    const order = await newOrder()
    await expect(
      db.emailOutbox.create({ data: row(order.id, { attempts: -1 }) })
    ).rejects.toThrow()
  })

  it("refuses a recipient hash that is not 64 lower-case hex characters", async () => {
    const order = await newOrder()
    for (const recipientHash of ["abc", HASH.toUpperCase(), `${HASH}0`]) {
      await expect(
        db.emailOutbox.create({ data: row(order.id, { recipientHash }) })
      ).rejects.toThrow()
    }
  })

  it("a sent row has its time and message id", async () => {
    const order = await newOrder()
    const sent = { status: "SENT" as const }
    await expect(
      db.emailOutbox.create({ data: row(order.id, sent) })
    ).rejects.toThrow()
    await expect(
      db.emailOutbox.create({
        data: row(order.id, { ...sent, sentAt: new Date() }),
      })
    ).rejects.toThrow()
    await db.emailOutbox.create({
      data: row(order.id, {
        ...sent,
        sentAt: new Date(),
        providerMessageId: "fake_1",
      }),
    })
  })

  it("only a sent row has a sent time or message id", async () => {
    const order = await newOrder()
    for (const status of ["PENDING", "SKIPPED", "FAILED"] as const) {
      await expect(
        db.emailOutbox.create({
          data: row(order.id, { status, sentAt: new Date() }),
        })
      ).rejects.toThrow()
    }
    await expect(
      db.emailOutbox.create({
        data: row(order.id, { providerMessageId: "fake_1" }),
      })
    ).rejects.toThrow()
  })

  it("a sending row has the time of its claim", async () => {
    const order = await newOrder()
    await expect(
      db.emailOutbox.create({ data: row(order.id, { status: "SENDING" }) })
    ).rejects.toThrow()
    await db.emailOutbox.create({
      data: row(order.id, { status: "SENDING", claimedAt: new Date() }),
    })
  })
})

describe("outbox rows are never deleted with their order", () => {
  it("refuses to delete an order that has an outbox row", async () => {
    const order = await newOrder()
    await db.emailOutbox.create({ data: row(order.id) })
    await expect(db.order.delete({ where: { id: order.id } })).rejects.toThrow()
  })
})

describe("resetCatalog", () => {
  it("empties the outbox and the fake transport's table", async () => {
    const order = await newOrder()
    await db.emailOutbox.create({ data: row(order.id) })
    await db.fakeEmail.create({
      data: {
        id: "fake_1",
        idempotencyKey: "k",
        from: "a@b.co",
        to: "c@d.co",
        subject: "s",
        html: "<p>h</p>",
        text: "t",
      },
    })
    await resetCatalog()
    expect(await db.emailOutbox.count()).toBe(0)
    expect(await db.fakeEmail.count()).toBe(0)
  })
})
