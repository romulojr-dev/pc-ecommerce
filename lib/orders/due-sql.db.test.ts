import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeGateway } from "@/lib/payments/fake"
import { db, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"
import { paymentData } from "@/test-support/payments"

import { dueOrderCondition } from "./due-sql"
import { checkExpiredOrders } from "./release"
import { isDue } from "./release-rules"

// docs/specs/041-admin-orders-list-detail, E31 and D11: the SQL condition the
// release uses (and Admin's badge), the pure isDue and the release's own
// selection agree on the same orders.

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidateTag: vi.fn(),
}))

const DEADLINE = new Date("2026-11-02T07:00:00Z")
const sec = (s: number) => new Date(DEADLINE.getTime() + s * 1000)

type Fixture = {
  name: string
  now: Date
  data: Parameters<typeof orderData>[0]
  problem?: "AMOUNT_MISMATCH" | "LATE"
}

const cancelled = {
  status: "CANCELLED" as const,
  cancelledAt: DEADLINE,
  cancelReason: "EXPIRED" as const,
}
const cod = { paymentOption: "COD" as const }

const FIXTURES: Fixture[] = [
  { name: "online, 1 s before the deadline", now: sec(-1), data: {} },
  { name: "online, at the deadline", now: sec(0), data: {} },
  { name: "online, 1 s after", now: sec(1), data: {} },
  {
    name: "cash pending confirmation, after",
    now: sec(5),
    data: { ...cod, status: "PENDING_CONFIRMATION" },
  },
  {
    name: "cash pending confirmation, before",
    now: sec(-5),
    data: { ...cod, status: "PENDING_CONFIRMATION" },
  },
  {
    name: "online, after, with an amount mismatch",
    now: sec(5),
    data: {},
    problem: "AMOUNT_MISMATCH",
  },
  {
    name: "COD confirmed, long after",
    now: sec(100_000),
    data: { ...cod, status: "COD_CONFIRMED", confirmedAt: sec(-100) },
  },
  { name: "cancelled, after", now: sec(5), data: cancelled },
  {
    name: "cancelled with a late payment, after",
    now: sec(5),
    data: { ...cancelled, refundRequired: true },
    problem: "LATE",
  },
  {
    name: "paid, after",
    now: sec(5),
    data: { status: "PAID", paidAt: sec(-50), paymentMethod: "FAKE" },
  },
]

beforeEach(async () => {
  await resetCatalog()
})

describe("E31: one definition of due", () => {
  it.each(FIXTURES)(
    "$name: SQL condition, isDue and the release agree",
    async ({ now, data, problem }) => {
      const order = await db.order.create({
        data: orderData({ expiresAt: DEADLINE, ...data }),
      })
      if (problem) {
        await db.payment.create({
          data: paymentData(order.id, {
            status: problem === "LATE" ? "PAID" : "PENDING",
            ...(problem === "LATE" ? { paidAt: now } : {}),
            problem,
          }),
        })
      }

      const row = await db.order.findUniqueOrThrow({ where: { id: order.id } })
      const byRule = isDue(
        { status: row.status, expiresAt: row.expiresAt, flagged: !!problem },
        now
      )

      const bySql = await db.$queryRaw<{ id: string }[]>`
        SELECT o."id" FROM "Order" o
        WHERE o."id" = ${order.id} AND ${dueOrderCondition(now)}`

      const check = await checkExpiredOrders({
        now,
        limit: 10,
        gateway: fakeGateway(),
        environment: "development",
      })

      expect(bySql.length === 1).toBe(byRule)
      expect(check.cleared.some(({ id }) => id === order.id)).toBe(byRule)
    }
  )
})
