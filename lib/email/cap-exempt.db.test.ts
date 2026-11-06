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

import { sendPending } from "./send"

// docs/specs/043-order-fulfillment-transitions: the cap never skips the three
// staff-triggered types, but they still count (E18, E18a, E19, E20)

beforeEach(resetCatalog)
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const ANA = "ana.reyes@example.com"
const N = new Date(PLACED.getTime() + 2 * HOUR)
const within = ago(N, HOUR)

const ALL = testTemplates([
  "ORDER_PLACED",
  "PAYMENT_RECEIVED",
  "ORDER_CANCELLED",
  "COD_CONFIRM",
  "ORDER_SHIPPED",
  "ORDER_DELIVERED",
  "READY_FOR_PICKUP",
  "ORDER_CANCELLED_BY_STORE",
])

async function dueRow(
  type:
    | "ORDER_SHIPPED"
    | "ORDER_PLACED"
    | "READY_FOR_PICKUP"
    | "ORDER_DELIVERED"
    | "ORDER_CANCELLED"
    | "ORDER_CANCELLED_BY_STORE"
) {
  const order = await newOrder(ANA)
  return outboxRow(order.id, ANA, { type, createdAt: ago(N, MINUTE) })
}

const statusOf = async (id: string) =>
  (await db.emailOutbox.findUniqueOrThrow({ where: { id } })).status

const send = () =>
  sendPending({
    now: N,
    transport: guardEmailTransport(recordingTransport().transport),
    templates: ALL,
  })

describe("the exemption", () => {
  it.each([4, 5, 6])(
    "E18/E19/E20: with %i other emails today, a Shipped email is sent",
    async (n) => {
      await countedRows(ANA, n, within)
      const row = await dueRow("ORDER_SHIPPED")
      await send()
      expect(await statusOf(row.id)).toBe("SENT")
    }
  )

  it("sends Ready for pickup and Delivered past the cap too", async () => {
    await countedRows(ANA, 6, within)
    const ready = await dueRow("READY_FOR_PICKUP")
    const delivered = await dueRow("ORDER_DELIVERED")
    await send()
    expect(await statusOf(ready.id)).toBe("SENT")
    expect(await statusOf(delivered.id)).toBe("SENT")
  })

  it("an ordinary email is still skipped at the cap (control)", async () => {
    await countedRows(ANA, 5, within)
    const row = await dueRow("ORDER_PLACED")
    await send()
    expect(await statusOf(row.id)).toBe("SKIPPED")
  })

  it("E18: after a Shipped email past the cap, the next Order placed is skipped as before", async () => {
    await countedRows(ANA, 5, within)
    const shipped = await dueRow("ORDER_SHIPPED")
    await send()
    expect(await statusOf(shipped.id)).toBe("SENT")
    const placed = await dueRow("ORDER_PLACED")
    await send()
    expect(await statusOf(placed.id)).toBe("SKIPPED")
  })

  it("E18a: an exempt email counts: four sent plus one Shipped makes an Order placed the sixth", async () => {
    await countedRows(ANA, 4, within)
    const shippedOrder = await newOrder(ANA)
    await outboxRow(shippedOrder.id, ANA, {
      type: "ORDER_SHIPPED",
      status: "SENT",
      sentAt: within,
      providerMessageId: "fake_exempt_counted",
      attempts: 1,
      createdAt: ago(within, MINUTE),
    })
    const placed = await dueRow("ORDER_PLACED")
    await send()
    expect(await statusOf(placed.id)).toBe("SKIPPED")
  })
})

// docs/specs/044-admin-cancel-order: R20, E31, E32
describe("the cancelled emails and the cap", () => {
  it("E31: six unpaid orders released to one address are still capped", async () => {
    const rows = []
    for (let i = 0; i < 6; i++) rows.push(await dueRow("ORDER_CANCELLED"))
    await send()
    const statuses = await Promise.all(rows.map((row) => statusOf(row.id)))
    expect(statuses.filter((s) => s === "SENT")).toHaveLength(5)
    expect(statuses.filter((s) => s === "SKIPPED")).toHaveLength(1)
  })

  it("E32: a staff cancel over the cap is sent, and counts toward it", async () => {
    await countedRows(ANA, 5, within)
    const byStore = await dueRow("ORDER_CANCELLED_BY_STORE")
    await send()
    expect(await statusOf(byStore.id)).toBe("SENT")
    const released = await dueRow("ORDER_CANCELLED")
    await send()
    expect(await statusOf(released.id)).toBe("SKIPPED")
  })
})
