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
  ago,
  consoleOutput,
  HOUR,
  MINUTE,
  newOrder,
  outboxRow,
  PLACED,
  recordingTransport,
  testTemplates,
} from "@/test-support/email"
import { guardEmailTransport } from "@/test-support/release"

import { fakeTransport } from "./fake"
import { recipientHash } from "./recipient"
import { sendPending } from "./send"

// The send path's retries, lease, window and logs (docs/specs/035-email-
// foundation-signed-links): O5–O12b, O14.

beforeEach(resetCatalog)
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const EMAIL = "ana@example.com"
const T = new Date(PLACED.getTime() + MINUTE)
const at = (ms: number) => new Date(T.getTime() + ms)

async function pendingRow() {
  const order = await newOrder()
  const row = await outboxRow(order.id, EMAIL)
  return { order, row }
}

const send = (
  transport = recordingTransport().transport,
  options: Parameters<typeof sendPending>[0] = {}
) =>
  sendPending({
    now: T,
    transport: guardEmailTransport(transport),
    templates: testTemplates(),
    ...options,
  })

const failing = (code: string) =>
  recordingTransport(() => ({ ok: false, code }))

describe("a failed send", () => {
  it("fails the row, changes nothing else, and is retried after 5 minutes (O5)", async () => {
    const { order, row } = await pendingRow()
    const orderBefore = await db.order.findUniqueOrThrow({
      where: { id: order.id },
    })
    let calls = 0
    const { transport, sent } = recordingTransport(() =>
      ++calls === 1 ? { ok: false, code: "timeout" } : { ok: true, id: "m2" }
    )

    expect(await send(transport)).toMatchObject({ failed: 1 })
    expect(
      await db.emailOutbox.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({ status: "FAILED", lastErrorCode: "timeout", attempts: 1 })
    expect(
      await db.order.findUniqueOrThrow({ where: { id: order.id } })
    ).toEqual(orderBefore)

    // 4:59 later: not due. 5:00 later: sent.
    expect(await send(transport, { now: at(5 * MINUTE - 1000) })).toMatchObject(
      { claimed: 0 }
    )
    expect(await send(transport, { now: at(5 * MINUTE) })).toMatchObject({
      sent: 1,
    })
    expect(sent).toHaveLength(2)
    expect(
      await db.emailOutbox.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({ status: "SENT", attempts: 2, lastErrorCode: null })
  })

  it("a refusal retrying can't fix is final (O6)", async () => {
    const { row } = await pendingRow()
    const { transport, sent } = failing("http-422:validation_error")
    await send(transport)
    expect(
      await db.emailOutbox.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({
      status: "FAILED",
      lastErrorCode: "http-422:validation_error",
      attempts: 5,
    })
    // Never due again, however long afterwards (within the window)
    await send(transport, { now: at(2 * HOUR) })
    await send(transport, { now: at(10 * HOUR) })
    expect(sent).toHaveLength(1)
  })

  it("stops after 5 attempts (O7)", async () => {
    const { row } = await pendingRow()
    const { transport, sent } = recordingTransport(() => {
      throw new Error("the network is down")
    })
    for (let i = 0; i < 5; i++) {
      expect(await send(transport, { now: at(i * 5 * MINUTE) })).toMatchObject({
        failed: 1,
      })
    }
    expect(
      await db.emailOutbox.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({ status: "FAILED", attempts: 5, lastErrorCode: "network" })
    expect(await send(transport, { now: at(30 * MINUTE) })).toMatchObject({
      claimed: 0,
    })
    expect(sent).toHaveLength(5)
  })

  it("a type with no template fails final without calling the transport (O8)", async () => {
    const { row } = await pendingRow()
    const { transport, sent } = recordingTransport()
    await send(transport, { templates: {} })
    expect(
      await db.emailOutbox.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({
      status: "FAILED",
      lastErrorCode: "no-template",
      attempts: 5,
    })
    expect(sent).toHaveLength(0)
  })

  it("a template that throws fails final", async () => {
    const { row } = await pendingRow()
    const { transport, sent } = recordingTransport()
    vi.spyOn(console, "error").mockImplementation(() => {})
    await send(transport, {
      templates: {
        ORDER_PLACED: () => {
          throw new Error("boom")
        },
      },
    })
    expect(
      await db.emailOutbox.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({ lastErrorCode: "render-error", attempts: 5 })
    expect(sent).toHaveLength(0)
  })
})

describe("concurrent senders", () => {
  it("two sweeps at once call the transport once (O9)", async () => {
    await pendingRow()
    const { transport, sent } = recordingTransport(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
      return { ok: true, id: "m" }
    })
    const [a, b] = await Promise.all([send(transport), send(transport)])
    expect(sent).toHaveLength(1)
    expect(a.sent + b.sent).toBe(1)
    expect(await db.emailOutbox.count({ where: { status: "SENT" } })).toBe(1)
  })
})

describe("the lease", () => {
  const sendingRow = async () => {
    const order = await newOrder()
    const row = await outboxRow(order.id, EMAIL, {
      status: "SENDING",
      attempts: 1,
      claimedAt: T,
    })
    return { order, row }
  }

  it("is taken over after 5 minutes, not before, with the same key (O10)", async () => {
    const { order, row } = await sendingRow()
    // The first sender did deliver, then died before settling
    await fakeTransport().send({
      from: "a@b.co",
      to: EMAIL,
      subject: "s",
      html: "h",
      text: "t",
      idempotencyKey: `${order.id}:ORDER_PLACED`,
    })

    const transport = fakeTransport()
    expect(await send(transport, { now: at(5 * MINUTE - 1000) })).toMatchObject(
      { claimed: 0 }
    )
    expect(await send(transport, { now: at(5 * MINUTE) })).toMatchObject({
      sent: 1,
    })
    expect(
      await db.emailOutbox.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({ status: "SENT", attempts: 2 })
    // The idempotency key made it the same message
    expect(await db.fakeEmail.count()).toBe(1)
  })

  it("a late settle by the first sender changes nothing (O11)", async () => {
    const { row } = await pendingRow()
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    const slow = recordingTransport(async () => {
      await held
      return { ok: true, id: "slow" }
    })
    const first = send(slow.transport)
    // Wait until the first sender has claimed the row
    for (let i = 0; i < 100 && slow.sent.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    expect(slow.sent).toHaveLength(1)

    const takeover = await send(
      recordingTransport(() => ({ ok: true, id: "fast" })).transport,
      {
        now: at(5 * MINUTE),
      }
    )
    expect(takeover).toMatchObject({ sent: 1 })

    release()
    await first
    expect(
      await db.emailOutbox.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({
      status: "SENT",
      providerMessageId: "fast",
      sentAt: at(5 * MINUTE),
      attempts: 2,
    })
  })
})

describe("the 24-hour window (D6)", () => {
  const rowCreated = async (createdAt: Date, overrides = {}) => {
    const order = await newOrder()
    return outboxRow(order.id, EMAIL, { createdAt, ...overrides })
  }

  it("sends at 23:59:59, and fails the row final at 24:00:00 (O12)", async () => {
    const young = await rowCreated(ago(at(0), 24 * HOUR - 1000))
    const old = await rowCreated(ago(at(0), 24 * HOUR))
    const { transport, sent } = recordingTransport()

    const lines = await consoleOutput(() => send(transport))
    expect(sent).toHaveLength(1)
    expect(
      await db.emailOutbox.findUniqueOrThrow({ where: { id: young.id } })
    ).toMatchObject({ status: "SENT" })
    expect(
      await db.emailOutbox.findUniqueOrThrow({ where: { id: old.id } })
    ).toMatchObject({
      status: "FAILED",
      lastErrorCode: "too-old",
      attempts: 5,
    })

    const failures = lines.filter((l) => l.includes('"email.failed"'))
    expect(failures).toHaveLength(1)
    expect(JSON.parse(failures[0])).toEqual({
      event: "email.failed",
      outboxId: old.id,
      type: "ORDER_PLACED",
      code: "too-old",
    })

    // A second run neither touches it nor logs it again
    const again = await consoleOutput(() => send(transport))
    expect(again.filter((l) => l.includes("too-old"))).toHaveLength(0)
  })

  it("a retryable failure becomes too-old once the window passes (O12a)", async () => {
    const row = await rowCreated(PLACED, {
      status: "FAILED",
      attempts: 2,
      claimedAt: at(23 * HOUR),
      lastErrorCode: "timeout",
    })
    const { transport, sent } = recordingTransport()
    const lines = await consoleOutput(() =>
      send(transport, { now: new Date(PLACED.getTime() + 24 * HOUR) })
    )
    expect(sent).toHaveLength(0)
    expect(
      await db.emailOutbox.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({ status: "FAILED", lastErrorCode: "too-old", attempts: 5 })
    expect(lines.filter((l) => l.includes("too-old"))).toHaveLength(1)
  })

  it("an abandoned sending row is not repeated after the window (O12b)", async () => {
    const row = await rowCreated(PLACED, {
      status: "SENDING",
      attempts: 1,
      claimedAt: at(HOUR),
    })
    const { transport, sent } = recordingTransport()
    await send(transport, { now: new Date(PLACED.getTime() + 24 * HOUR) })
    expect(sent).toHaveLength(0)
    expect(
      await db.emailOutbox.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({ status: "FAILED", lastErrorCode: "too-old" })
  })
})

describe("logs (O14)", () => {
  it("carry the event, outbox id, type and a code, nothing else", async () => {
    const [a, b, c] = [
      await newOrder("one@example.com"),
      await newOrder("two@example.com"),
      await newOrder("three@example.com"),
    ]
    const sentRow = await outboxRow(a.id, "one@example.com")
    const timeoutRow = await outboxRow(b.id, "two@example.com", {
      type: "ORDER_CANCELLED",
    })
    await outboxRow(c.id, "three@example.com", { type: "COD_CONFIRM" })

    // Claims go in recipient-hash order, so answer by who it is to
    const { transport } = recordingTransport((call) => ({
      ok: true,
      id: `m${call}`,
    }))
    const answering = {
      send: async (message: Parameters<typeof transport.send>[0]) =>
        message.to === "one@example.com"
          ? transport.send(message)
          : ({ ok: false, code: "timeout" } as const),
    }
    const lines = await consoleOutput(() =>
      send(answering, {
        templates: testTemplates(["ORDER_PLACED", "ORDER_CANCELLED"]),
      })
    )

    expect(lines.length).toBeGreaterThanOrEqual(3)
    const secrets = [
      "one@example.com",
      "two@example.com",
      "three@example.com",
      recipientHash("one@example.com"),
      "sig=",
      "p=view",
      "/orders/",
      a.orderNumber,
      a.accessTokenHash,
      "ORDER_PLACED PCS",
    ]
    for (const line of lines) {
      for (const secret of secrets) expect(line).not.toContain(secret)
      const parsed = JSON.parse(line)
      expect(
        Object.keys(parsed).every((k) =>
          ["event", "outboxId", "type", "code", "reason"].includes(k)
        )
      ).toBe(true)
    }
    const events = lines.map((l) => JSON.parse(l))
    expect(events).toContainEqual({
      event: "email.sent",
      outboxId: sentRow.id,
      type: "ORDER_PLACED",
    })
    expect(events).toContainEqual({
      event: "email.failed",
      outboxId: timeoutRow.id,
      type: "ORDER_CANCELLED",
      code: "timeout",
    })
    expect(events.map((e) => e.code)).toContain("no-template")
  })
})
