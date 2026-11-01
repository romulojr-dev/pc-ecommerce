import { randomBytes } from "node:crypto"

import { db } from "@/lib/db"
import type { Prisma } from "@/generated/prisma/client"

import { FAKE_INSTRUCTIONS } from "./copy"
import type {
  PaymentGateway,
  SessionDetails,
  SessionStatus,
} from "./gateway-types"

// The fake gateway (docs/specs/031-pay-with-xendit, §6 Fake adapter, D7–D9):
// it stands in for Xendit in CI, E2E and previews, which receive no real
// webhooks. It keeps its own sessions in FakeGatewaySession, in Xendit's ids
// and statuses, so it can say "completed" without reading the store's
// Payment rows (#80 confirms a payment through the gateway).
//
// Its payment page is the store's own /test-payment/{id}?key=…: the key is
// read from the success URL it is given, and no URL is stored, so the order's
// token is never kept in clear (ADR 0009).

type FakeStatus = "ACTIVE" | "COMPLETED" | "EXPIRED" | "CANCELED"

const STATUS: Record<FakeStatus, SessionStatus> = {
  ACTIVE: "active",
  COMPLETED: "completed",
  EXPIRED: "expired",
  CANCELED: "closed",
}

// Xendit's shapes: "ps-" / "py-" and 24 hex characters
const newId = (prefix: "ps" | "py") =>
  `${prefix}-${randomBytes(12).toString("hex")}`

export const fakePaymentPath = (id: string, key: string): string =>
  `/test-payment/${id}?key=${encodeURIComponent(key)}`

export type FakeOptions = {
  // Test seams (A6, A7): make a call fail as a gateway error would
  fail?: { create?: boolean; close?: boolean; get?: boolean }
  now?: () => Date
}

type Row = Awaited<ReturnType<typeof db.fakeGatewaySession.findUnique>>

// A session whose time has passed reads as expired, and is stored so
function current(row: NonNullable<Row>, now: Date): FakeStatus {
  const status = row.status as FakeStatus
  return status === "ACTIVE" && row.expiresAt.getTime() <= now.getTime()
    ? "EXPIRED"
    : status
}

async function read(id: string, now: Date) {
  const row = await db.fakeGatewaySession.findUnique({ where: { id } })
  if (!row) return null
  const status = current(row, now)
  if (status !== row.status) {
    await db.fakeGatewaySession.update({ where: { id }, data: { status } })
  }
  return { ...row, status }
}

const details = (
  row: NonNullable<Awaited<ReturnType<typeof read>>>
): SessionDetails => ({
  id: row.id,
  status: STATUS[row.status],
  amountCentavos: row.amount,
  currency: row.currency,
  metadata: row.metadata as Record<string, unknown>,
  paymentId: row.paymentId,
})

const failed = { ok: false, code: "http-500" } as const

export function fakeGateway({
  fail = {},
  now = () => new Date(),
}: FakeOptions = {}): PaymentGateway {
  return {
    provider: "FAKE",
    name: "the test payment page",
    testInstructions: FAKE_INSTRUCTIONS,

    async createSession(input) {
      if (fail.create) return failed
      const key = new URL(input.successUrl).searchParams.get("key")
      if (!key) return { ok: false, code: "invalid-request" }
      const id = newId("ps")
      await db.fakeGatewaySession.create({
        data: {
          id,
          status: "ACTIVE",
          amount: input.amountCentavos,
          currency: input.currency,
          referenceId: input.referenceId,
          metadata: input.metadata as Prisma.InputJsonValue,
          expiresAt: input.expiresAt,
        },
      })
      return {
        ok: true,
        session: {
          id,
          url: fakePaymentPath(id, key),
          status: "active",
          expiresAt: input.expiresAt,
        },
      }
    },

    async closeSession(id) {
      if (fail.close) return failed
      const row = await read(id, now())
      if (!row) return { ok: false, code: "not-found" }
      if (row.status === "COMPLETED") return { ok: true, outcome: "completed" }
      if (row.status === "ACTIVE") {
        await db.fakeGatewaySession.update({
          where: { id },
          data: { status: "CANCELED" },
        })
      }
      return { ok: true, outcome: "closed" }
    },

    async getSession(id) {
      if (fail.get) return failed
      const row = await read(id, now())
      return { ok: true, session: row ? details(row) : null }
    },

    async getPayment(id) {
      if (fail.get) return failed
      const row = await db.fakeGatewaySession.findFirst({
        where: { paymentId: id },
      })
      return {
        ok: true,
        payment: row
          ? {
              id,
              status: "succeeded",
              amountCentavos: row.amount,
              currency: row.currency,
              method: "FAKE",
            }
          : null,
      }
    },
  }
}

// What the fake payment page does: the gateway's side, not the store's

export type FakeSession = SessionDetails & {
  referenceId: string
  expiresAt: Date
}

export async function readFakeSession(
  id: string,
  now = new Date()
): Promise<FakeSession | null> {
  const row = await read(id, now)
  return row
    ? {
        ...details(row),
        referenceId: row.referenceId,
        expiresAt: row.expiresAt,
      }
    : null
}

// Pay: an active session completes, with a payment id. Null when it isn't
// active (already paid, cancelled or expired).
export async function completeFakeSession(
  id: string,
  now = new Date()
): Promise<FakeSession | null> {
  const row = await read(id, now)
  if (!row || row.status !== "ACTIVE") return null
  const done = await db.fakeGatewaySession.updateMany({
    where: { id, status: "ACTIVE" },
    data: { status: "COMPLETED", paymentId: newId("py") },
  })
  return done.count === 1 ? readFakeSession(id, now) : null
}

// Let it expire: an active session expires now. Null when it isn't active.
export async function expireFakeSession(
  id: string,
  now = new Date()
): Promise<FakeSession | null> {
  const row = await read(id, now)
  if (!row || row.status !== "ACTIVE") return null
  const done = await db.fakeGatewaySession.updateMany({
    where: { id, status: "ACTIVE" },
    data: { status: "EXPIRED" },
  })
  return done.count === 1 ? readFakeSession(id, now) : null
}
