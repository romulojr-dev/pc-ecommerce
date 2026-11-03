import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { db, resetCatalog } from "@/test-support/db"
import {
  newOrder,
  PLACED,
  recordingTransport,
  testTemplates,
} from "@/test-support/email"
import { guardEmailTransport } from "@/test-support/release"

import { fakeTransport } from "./fake"
import { enqueueEmail } from "./outbox"
import { recipientHash } from "./recipient"
import { sendPending } from "./send"

// The outbox and the send path (docs/specs/035-email-foundation-signed-links):
// O1–O4, O13. Fake transport, Docker Postgres.

beforeEach(resetCatalog)
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const NOW = new Date(PLACED.getTime() + 60_000)

describe("enqueueEmail", () => {
  it("writes one pending row; writing again is a no-op that raises nothing (O1)", async () => {
    const order = await newOrder()
    const [first, second] = await db.$transaction(async (tx) => [
      await enqueueEmail(tx, order.id, "ORDER_PLACED"),
      await enqueueEmail(tx, order.id, "ORDER_PLACED"),
    ])
    const third = await db.$transaction((tx) =>
      enqueueEmail(tx, order.id, "ORDER_PLACED")
    )

    expect(first).toEqual({ id: expect.any(String) })
    expect(second).toBeNull()
    expect(third).toBeNull()

    const rows = await db.emailOutbox.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      orderId: order.id,
      type: "ORDER_PLACED",
      status: "PENDING",
      attempts: 0,
      recipientHash: recipientHash("ana@example.com"),
      lastErrorCode: null,
      claimedAt: null,
      sentAt: null,
      providerMessageId: null,
    })
    // No address, no rendered email, no secret in the row
    expect(JSON.stringify(rows[0])).not.toContain("ana@example.com")
  })

  it("another type for the same order is another row", async () => {
    const order = await newOrder()
    await db.$transaction(async (tx) => {
      await enqueueEmail(tx, order.id, "ORDER_PLACED")
      await enqueueEmail(tx, order.id, "ORDER_CANCELLED")
    })
    expect(await db.emailOutbox.count()).toBe(2)
  })

  it("leaves no row when the trigger's transaction rolls back (O2)", async () => {
    const order = await newOrder()
    await expect(
      db.$transaction(async (tx) => {
        await enqueueEmail(tx, order.id, "ORDER_PLACED")
        throw new Error("the trigger failed")
      })
    ).rejects.toThrow("the trigger failed")
    expect(await db.emailOutbox.count()).toBe(0)
  })
})

describe("sending", () => {
  it("sends once, with the idempotency key and a signed link (O3, O4)", async () => {
    const order = await newOrder()
    await db.$transaction((tx) => enqueueEmail(tx, order.id, "ORDER_PLACED"))

    const options = {
      now: NOW,
      transport: guardEmailTransport(fakeTransport()),
      templates: testTemplates(),
    }
    const summary = await sendPending(options)
    expect(summary).toMatchObject({ claimed: 1, sent: 1, failed: 0 })

    const row = await db.emailOutbox.findFirstOrThrow()
    const fake = await db.fakeEmail.findFirstOrThrow()
    expect(row).toMatchObject({
      status: "SENT",
      attempts: 1,
      sentAt: NOW,
      providerMessageId: fake.id,
      lastErrorCode: null,
    })
    expect(fake.id).toMatch(/^fake_[0-9a-f]{24}$/)
    expect(fake).toMatchObject({
      idempotencyKey: `${order.id}:ORDER_PLACED`,
      to: "ana@example.com",
      from: "PC Silicon <orders@mail.pcsilicon.tech>",
    })
    expect(fake.html).toMatch(
      new RegExp(
        `http://localhost:3000/orders/${order.orderNumber}\\?sig=[\\w-]{43}&exp=\\d{10}&p=view`
      )
    )

    // A second run sends nothing more
    expect(await sendPending(options)).toMatchObject({ claimed: 0, sent: 0 })
    expect(await db.fakeEmail.count()).toBe(1)
  })

  it("sends only the row it was asked for (ids)", async () => {
    const [a, b] = [await newOrder(), await newOrder("ben@example.com")]
    await db.$transaction(async (tx) => {
      await enqueueEmail(tx, a.id, "ORDER_PLACED")
      await enqueueEmail(tx, b.id, "ORDER_PLACED")
    })
    const rowA = await db.emailOutbox.findFirstOrThrow({
      where: { orderId: a.id },
    })
    const { transport, sent } = recordingTransport()
    await sendPending({
      now: NOW,
      ids: [rowA.id],
      transport,
      templates: testTemplates(),
    })
    expect(sent.map((m) => m.to)).toEqual(["ana@example.com"])
  })

  it("refuses to run the transport inside a transaction (O13)", async () => {
    const guarded = guardEmailTransport(recordingTransport().transport)
    const message = {
      from: "a@b.co",
      to: "c@d.co",
      subject: "s",
      html: "h",
      text: "t",
      idempotencyKey: "k",
    }
    await expect(
      db.$transaction(async () => guarded.send(message))
    ).rejects.toThrow("send called inside a transaction")
    await expect(guarded.send(message)).resolves.toMatchObject({ ok: true })
  })
})

describe("the fake transport", () => {
  it("returns the same message for the same key, with one row", async () => {
    const transport = fakeTransport()
    const message = {
      from: "a@b.co",
      to: "c@d.co",
      subject: "s",
      html: "h",
      text: "t",
      idempotencyKey: "order-1:ORDER_PLACED",
    }
    const [one, two] = await Promise.all([
      transport.send(message),
      transport.send(message),
    ])
    expect(one).toMatchObject({ ok: true })
    expect(two).toEqual(one)
    expect(await db.fakeEmail.count()).toBe(1)
  })

  it("can be told to fail", async () => {
    const result = await fakeTransport({ fail: "timeout" }).send({
      from: "a@b.co",
      to: "c@d.co",
      subject: "s",
      html: "h",
      text: "t",
      idempotencyKey: "k",
    })
    expect(result).toEqual({ ok: false, code: "timeout" })
    expect(await db.fakeEmail.count()).toBe(0)
  })
})
