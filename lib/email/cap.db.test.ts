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
  countedRows,
  HOUR,
  MINUTE,
  newOrder,
  outboxRow,
  PLACED,
  recordingTransport,
  testTemplates,
} from "@/test-support/email"
import { guardEmailTransport } from "@/test-support/release"

import { sendEmail, sendPending } from "./send"

// The per-recipient cap (docs/specs/035-email-foundation-signed-links,
// Behavior 4): C1–C9, C7a–C7c. "Now" is N; counted rows were sent before it.

beforeEach(resetCatalog)
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const ANA = "ana.reyes@example.com"
const N = new Date(PLACED.getTime() + 2 * HOUR)
const within = ago(N, HOUR)

async function dueRow(email: string) {
  const order = await newOrder(email)
  const row = await outboxRow(order.id, email, { createdAt: ago(N, MINUTE) })
  return { order, row }
}

const statusOf = async (id: string) =>
  (await db.emailOutbox.findUniqueOrThrow({ where: { id } })).status

function send(transport = recordingTransport().transport) {
  return sendPending({
    now: N,
    transport: guardEmailTransport(transport),
    templates: testTemplates(),
  })
}

describe("the boundary", () => {
  it("the 5th email in 24 hours sends (C1)", async () => {
    await countedRows(ANA, 4, within)
    const { row } = await dueRow(ANA)
    await send()
    expect(await statusOf(row.id)).toBe("SENT")
  })

  it("the 6th is skipped: no call, a log line, never retried, order untouched (C2)", async () => {
    await countedRows(ANA, 5, within)
    const { order, row } = await dueRow(ANA)
    const orderBefore = await db.order.findUniqueOrThrow({
      where: { id: order.id },
    })
    const { transport, sent } = recordingTransport()

    const lines = await consoleOutput(() => send(transport))

    expect(sent).toHaveLength(0)
    expect(await statusOf(row.id)).toBe("SKIPPED")
    const skipped = lines.filter((l) => l.includes('"email.skipped"'))
    expect(skipped.map((l) => JSON.parse(l))).toEqual([
      {
        event: "email.skipped",
        outboxId: row.id,
        type: "ORDER_PLACED",
        reason: "recipient-cap",
      },
    ])
    expect(
      await db.order.findUniqueOrThrow({ where: { id: order.id } })
    ).toEqual(orderBefore)

    // Never retried, even once the cap has room again
    const later = await sendPending({
      now: new Date(N.getTime() + 48 * HOUR),
      transport,
      templates: testTemplates(),
    })
    expect(later.claimed).toBe(0)
    expect(await statusOf(row.id)).toBe("SKIPPED")
  })

  it("5 sent at 23:59:59 ago still count (C3)", async () => {
    await countedRows(ANA, 5, ago(N, 24 * HOUR - 1000))
    const { row } = await dueRow(ANA)
    await send()
    expect(await statusOf(row.id)).toBe("SKIPPED")
  })

  it("one sent exactly 24 hours ago no longer counts (C4)", async () => {
    await countedRows(ANA, 4, within)
    await countedRows(ANA, 1, ago(N, 24 * HOUR))
    const { row } = await dueRow(ANA)
    await send()
    expect(await statusOf(row.id)).toBe("SENT")
  })

  it("failed and skipped rows don't count (C5)", async () => {
    await countedRows(ANA, 4, within)
    await countedRows(ANA, 3, within, "FAILED")
    await countedRows(ANA, 3, within, "SKIPPED")
    const { row } = await dueRow(ANA)
    await send()
    expect(await statusOf(row.id)).toBe("SENT")
  })

  it("sending rows count (C6)", async () => {
    await countedRows(ANA, 4, within, "SENDING")
    const { row: fifth } = await dueRow(ANA)
    await send()
    expect(await statusOf(fifth.id)).toBe("SENT")

    await resetCatalog()
    await countedRows(ANA, 5, within, "SENDING")
    const { row: sixth } = await dueRow(ANA)
    await send()
    expect(await statusOf(sixth.id)).toBe("SKIPPED")
  })
})

describe("one recipient", () => {
  it("differences in case and spaces don't make another recipient (C7)", async () => {
    await countedRows(ANA, 4, within)
    const { row: fifth } = await dueRow("  ANA.REYES@Example.com ")
    await send()
    expect(await statusOf(fifth.id)).toBe("SENT")

    const { row: sixth } = await dueRow("Ana.Reyes@example.com")
    await send()
    expect(await statusOf(sixth.id)).toBe("SKIPPED")
  })

  it("+tags and case variants count toward one cap (C7a)", async () => {
    await countedRows(ANA, 1, within)
    await countedRows("Ana.Reyes+promo@example.com", 1, within)
    await countedRows("ana.reyes+order@example.com", 1, within)
    await countedRows(" ANA.REYES+X@EXAMPLE.COM ", 1, within)

    const { row: fifth } = await dueRow("ana.reyes+five@example.com")
    await send()
    expect(await statusOf(fifth.id)).toBe("SENT")

    const { row: sixth } = await dueRow("ana.reyes@example.com")
    await send()
    expect(await statusOf(sixth.id)).toBe("SKIPPED")
  })

  it("other addresses are other recipients (C7b)", async () => {
    await countedRows(ANA, 5, within)
    const { row: digit } = await dueRow("ana.reyes2@example.com")
    const { row: otherDomain } = await dueRow("ana.reyes+1@example.org")
    await send()
    expect(await statusOf(digit.id)).toBe("SENT")
    expect(await statusOf(otherDomain.id)).toBe("SENT")
  })

  it("the email goes to the address as the order has it (C7c)", async () => {
    const { row } = await dueRow("ana.reyes+promo@example.com")
    const { transport, sent } = recordingTransport()
    await send(transport)
    expect(await statusOf(row.id)).toBe("SENT")
    expect(sent.map((m) => m.to)).toEqual(["ana.reyes+promo@example.com"])
  })

  it("is per recipient: another address is sent (C9)", async () => {
    await countedRows(ANA, 5, within)
    const { row } = await dueRow("ben@example.com")
    await send()
    expect(await statusOf(row.id)).toBe("SENT")
  })
})

describe("concurrent claims", () => {
  it("two claims for one recipient at 4 can't both pass (C8)", async () => {
    await countedRows(ANA, 4, within)
    const [a, b] = [await dueRow(ANA), await dueRow(ANA)]
    const { transport, sent } = recordingTransport(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
      return { ok: true, id: "m" }
    })
    const guarded = guardEmailTransport(transport)
    // Each sweep is scoped to its own row, so neither can take the other's
    await Promise.all([
      sendEmail(a.row.id, {
        now: N,
        transport: guarded,
        templates: testTemplates(),
      }),
      sendEmail(b.row.id, {
        now: N,
        transport: guarded,
        templates: testTemplates(),
      }),
    ])
    const statuses = [await statusOf(a.row.id), await statusOf(b.row.id)].sort()
    expect(statuses).toEqual(["SENT", "SKIPPED"])
    expect(sent).toHaveLength(1)
  })
})
