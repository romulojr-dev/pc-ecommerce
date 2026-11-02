import { randomUUID } from "node:crypto"

import { db } from "@/lib/db"
import { logSafeFailure } from "@/lib/orders/log"
import type { OrderStatusName } from "@/lib/orders/timeline"
import type { Prisma } from "@/generated/prisma/client"

import { gateway, paymentEnvironment } from "./gateway"
import type {
  PaymentDetails,
  PaymentGateway,
  SessionDetails,
} from "./gateway-types"
import { logGatewayFailure, logPaymentEvent } from "./log"
import {
  amountsMatch,
  completedOutcome,
  expiredOutcome,
  type ReconcileOutcome,
} from "./outcome"
import type { PaymentEnvironment } from "./session-request"

// Reconcile a payment session with the gateway (docs/specs/032-payment-
// webhooks, behavior 7–17, D14): the one place that sets Paid (FR-22). The
// webhook route calls it with the event it received; #81 calls it without
// one before releasing an order, so a missed webhook can't cancel a paid
// order.
//
//   1. Ask the gateway, with no transaction open: the session, then its
//      payment. Completed and expired are final, so the answer can't go stale
//      before the lock.
//   2. One transaction, with no gateway call: lock the order, record the
//      event (a repeat stops here), apply the change.
//   3. After the commit: close any other open session of an order that just
//      became Paid, best effort.
//
// Gateway calls never run inside a database transaction (rule Gateway calls).

export type ReconcileEvent = {
  // "{event}:{payment_session_id}"
  eventId: string
  // Xendit's event name
  type: string
  // The body as received
  payload: unknown
}

export type ReconcileStep = "tx-open" | "event" | "tx-closed"

export type ReconcileOptions = {
  event?: ReconcileEvent
  gateway?: PaymentGateway
  environment?: PaymentEnvironment
  now?: Date
  // Test seam: "tx-open" first thing inside the transaction, "event" after
  // the event row (H14), "tx-closed" once the transaction has finished (H17)
  afterStep?: (step: ReconcileStep) => void | Promise<void>
}

export type ReconcileResult = {
  outcome: ReconcileOutcome
  orderNumber?: string
  // A gateway failure code, a session's environment, or "unknown-order"
  code?: string
}

const ENVIRONMENTS: readonly string[] = ["production", "preview", "development"]

// No HTTP inside, so a short limit
const TRANSACTION = { maxWait: 5_000, timeout: 10_000 } as const

type Confirmed =
  | { kind: "completed"; session: SessionDetails; payment: PaymentDetails }
  | { kind: "expired"; session: SessionDetails }

type KnownOrder = { id: string; orderNumber: string }

export async function reconcileSession(
  sessionId: string,
  options: ReconcileOptions = {}
): Promise<ReconcileResult> {
  const result = await reconcile(sessionId, options)
  // The webhook route logs its own line; a call without an event logs here,
  // so every call writes exactly one
  if (!options.event) {
    logPaymentEvent({ event: "payment.reconcile", sessionId, ...result })
  }
  return result
}

async function reconcile(
  sessionId: string,
  options: ReconcileOptions
): Promise<ReconcileResult> {
  const gw = options.gateway ?? gateway()
  const environment = options.environment ?? paymentEnvironment()

  // 1. Ask the gateway (no transaction)
  const read = await gw.getSession(sessionId)
  if (!read.ok) return { outcome: "retry", code: read.code }
  const session = read.session
  if (!session) return { outcome: "ignored-unknown" }

  const metadata = session.metadata ?? {}
  if (metadata.environment !== environment) {
    const theirs = metadata.environment
    return {
      outcome: "ignored-environment",
      code:
        typeof theirs === "string" && ENVIRONMENTS.includes(theirs)
          ? theirs
          : "unknown",
    }
  }
  const order = await knownOrder(metadata)
  if (!order) return { outcome: "ignored-unknown", code: "unknown-order" }
  const orderNumber = order.orderNumber

  let confirmed: Confirmed
  if (session.status === "active") return { outcome: "active", orderNumber }
  if (session.status === "completed") {
    if (!session.paymentId) return { outcome: "not-yet", orderNumber }
    const paid = await gw.getPayment(session.paymentId)
    if (!paid.ok) return { outcome: "retry", orderNumber, code: paid.code }
    if (!paid.payment || paid.payment.status === "pending") {
      return { outcome: "not-yet", orderNumber }
    }
    if (paid.payment.status === "failed") {
      return { outcome: "unconfirmed", orderNumber }
    }
    confirmed = { kind: "completed", session, payment: paid.payment }
  } else {
    confirmed = { kind: "expired", session }
  }

  // 2. Apply (one transaction, no gateway call)
  let toClose: string[] = []
  let outcome: ReconcileOutcome
  try {
    const applied = await db.$transaction(async (tx) => {
      await options.afterStep?.("tx-open")
      return apply(tx, gw, order, confirmed, options)
    }, TRANSACTION)
    outcome = applied.outcome
    toClose = applied.toClose
  } catch (error) {
    logSafeFailure("Reconcile payment", error)
    return { outcome: "error", orderNumber }
  }
  await options.afterStep?.("tx-closed")

  // 3. After the commit: the order is Paid, so its other open sessions close
  for (const ref of toClose) {
    const closed = await gw.closeSession(ref)
    if (!closed.ok) logGatewayFailure("payment.close_after_paid", closed.code)
  }
  return { outcome, orderNumber }
}

// The order the session's metadata names, when its number agrees
async function knownOrder(
  metadata: Record<string, unknown>
): Promise<KnownOrder | null> {
  const { order_id: id, order_number: number } = metadata
  if (typeof id !== "string" || typeof number !== "string") return null
  const order = await db.order.findUnique({
    where: { id },
    select: { id: true, orderNumber: true },
  })
  return order?.orderNumber === number ? order : null
}

type LockedOrder = {
  id: string
  status: OrderStatusName
  total: number
}

async function apply(
  tx: Prisma.TransactionClient,
  gw: PaymentGateway,
  order: KnownOrder,
  confirmed: Confirmed,
  { event, now = new Date(), afterStep }: ReconcileOptions
): Promise<{ outcome: ReconcileOutcome; toClose: string[] }> {
  const none = (outcome: ReconcileOutcome) => ({ outcome, toClose: [] })

  const [locked] = await tx.$queryRaw<LockedOrder[]>`
    SELECT "id", "status"::text AS "status", "total"
    FROM "Order" WHERE "id" = ${order.id} FOR UPDATE`
  const { session } = confirmed
  const existing = await tx.payment.findUnique({
    where: {
      provider_providerRef: { provider: gw.provider, providerRef: session.id },
    },
  })

  // The event, once: a repeat stops here. ON CONFLICT DO NOTHING, never a
  // caught P2002: Postgres aborts a transaction after any error.
  let eventRowId: string | null = null
  if (event) {
    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "PaymentEvent" ("id", "eventId", "type", "payload")
      VALUES (${randomUUID()}, ${event.eventId}, ${event.type},
        ${JSON.stringify(event.payload)}::jsonb)
      ON CONFLICT DO NOTHING
      RETURNING "id"`
    if (inserted.length === 0) return none("duplicate")
    eventRowId = inserted[0].id
    await afterStep?.("event")
  }
  const linkEvent = async (paymentId: string) => {
    if (eventRowId) {
      await tx.paymentEvent.update({
        where: { id: eventRowId },
        data: { paymentId },
      })
    }
  }

  if (confirmed.kind === "expired") {
    if (!existing) return none("already-applied")
    await linkEvent(existing.id)
    const outcome = expiredOutcome(existing.status)
    if (outcome === "expired") {
      await tx.payment.update({
        where: { id: existing.id },
        data: { status: "EXPIRED" },
      })
    }
    return none(outcome)
  }

  if (existing?.status === "PAID") {
    await linkEvent(existing.id)
    return none("already-applied")
  }

  const { payment } = confirmed
  const rowAmount = existing?.amount ?? session.amountCentavos
  const outcome = completedOutcome(
    locked.status,
    rowAmount !== null &&
      amountsMatch({
        sessionAmount: session.amountCentavos,
        sessionCurrency: session.currency,
        paymentAmount: payment.amountCentavos,
        paymentCurrency: payment.currency,
        rowAmount,
        orderTotal: locked.total,
      })
  )
  const received = payment.amountCentavos ?? session.amountCentavos
  const paid = {
    status: "PAID" as const,
    paidAt: now,
    gatewayPaymentId: payment.id,
    method: payment.method,
    receivedAmount: received !== null && received > 0 ? received : null,
    receivedCurrency: payment.currency,
    problem:
      outcome === "mismatch"
        ? ("AMOUNT_MISMATCH" as const)
        : outcome === "late"
          ? ("LATE" as const)
          : outcome === "second"
            ? ("SECOND_PAYMENT" as const)
            : null,
  }

  // An orphan session (created at the gateway while our transaction failed,
  // spec 031 A11) gets its row now, straight into its final status, so the
  // one-open-payment index is never hit
  const row = existing
    ? await tx.payment.update({ where: { id: existing.id }, data: paid })
    : await tx.payment.create({
        data: {
          orderId: order.id,
          provider: gw.provider,
          providerRef: session.id,
          referenceId: session.referenceId,
          amount:
            rowAmount !== null && rowAmount > 0 ? rowAmount : locked.total,
          currency: session.currency,
          expiresAt: session.expiresAt ?? now,
          ...paid,
        },
      })
  await linkEvent(row.id)

  if (outcome === "late" || outcome === "second") {
    await tx.order.update({
      where: { id: order.id },
      data: { refundRequired: true },
    })
  }
  if (outcome !== "paid") return none(outcome)

  await tx.order.update({
    where: { id: order.id },
    data: { status: "PAID", paidAt: now, paymentMethod: payment.method },
  })
  // Its other open sessions expire here and close at the gateway after the
  // commit (behavior 14)
  const open = await tx.payment.findMany({
    where: {
      orderId: order.id,
      status: "PENDING",
      id: { not: row.id },
      providerRef: { not: null },
    },
    select: { id: true, providerRef: true },
  })
  if (open.length > 0) {
    await tx.payment.updateMany({
      where: { id: { in: open.map(({ id }) => id) } },
      data: { status: "EXPIRED" },
    })
  }
  // A PENDING payment always has its session id (the attempt CHECK)
  const toClose = open.flatMap(({ providerRef }) =>
    providerRef ? [providerRef] : []
  )
  return { outcome, toClose }
}
