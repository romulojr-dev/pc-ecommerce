import { db } from "@/lib/db"
import { env } from "@/lib/env"
import { logSafeFailure } from "@/lib/orders/log"

import { gateway, paymentEnvironment } from "./gateway"
import type { CreatedSession, PaymentGateway } from "./gateway-types"
import { logGatewayFailure, logOrphanedSession } from "./log"
import { canStartSession } from "./payable"
import { type PaymentEnvironment, sessionRequest } from "./session-request"

// Start a payment for an order: Pay now, Retry payment, and the step after
// Place order (docs/specs/031-pay-with-xendit, Behavior 13–14; ADR 0010). The
// one writer of Payment rows in this story.
//
//   lock the order → payable? → close the open session → create a session →
//   insert its Payment
//
// The order row stays locked from the first step to the commit, so a double
// click, a second tab or a replayed Place order waits for the first and then
// closes the session it opened: at most one session per order is open. The
// gateway calls happen inside the lock, each with its own timeout; placement
// itself never calls the gateway.

export type StartResult =
  | { ok: true; url: string }
  | {
      ok: false
      reason: "confirming" | "expired" | "not-pending" | "not-found" | "error"
    }

export type StartStep = "lock" | "close" | "create" | "payment"

export type StartOptions = {
  now?: Date
  gateway?: PaymentGateway
  siteUrl?: string
  environment?: PaymentEnvironment
  // Test seam: runs after each step inside the transaction (A11)
  afterStep?: (step: StartStep) => void | Promise<void>
}

// A refusal thrown inside the transaction to roll it back; caught outside
class Refusal extends Error {
  constructor(readonly result: Extract<StartResult, { ok: false }>) {
    super("refused")
    this.name = "Refusal"
  }
}

const refuse = (reason: Extract<StartResult, { ok: false }>["reason"]) =>
  new Refusal({ ok: false, reason })

// Up to three gateway calls of 6 s each (close, the read after a "not
// active" answer, create) fit inside the limit
const TRANSACTION = { maxWait: 5_000, timeout: 25_000 } as const

type LockedOrder = {
  id: string
  orderNumber: string
  status: string
  total: number
  expiresAt: Date
}

export async function startPayment(
  orderId: string,
  accessToken: string,
  {
    now = new Date(),
    gateway: chosen,
    siteUrl = env.NEXT_PUBLIC_SITE_URL,
    environment,
    afterStep,
  }: StartOptions = {}
): Promise<StartResult> {
  const gw = chosen ?? gateway()
  // Set once the gateway has made a session, so a failure after it can name
  // the orphan
  const created: { session: CreatedSession | null } = { session: null }

  try {
    return await db.$transaction(async (tx) => {
      // 1. Lock the order, then check it can still be paid
      const [order] = await tx.$queryRaw<LockedOrder[]>`
        SELECT "id", "orderNumber", "status"::text AS "status", "total",
          "expiresAt"
        FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
      if (!order) throw refuse("not-found")
      if (order.status !== "PENDING_PAYMENT") throw refuse("not-pending")
      if (!canStartSession(order.expiresAt, now)) throw refuse("expired")
      await afterStep?.("lock")

      // 2. Close the open session. If it was paid first, a payment is on
      //    its way: no new session (Behavior 13.2).
      const open = await tx.payment.findFirst({
        where: { orderId, status: "PENDING" },
        select: { id: true, providerRef: true },
      })
      if (open) {
        const closed = await gw.closeSession(open.providerRef)
        if (!closed.ok) {
          logGatewayFailure("payment.close", closed.code)
          throw refuse("error")
        }
        if (closed.outcome === "completed") throw refuse("confirming")
        await tx.payment.update({
          where: { id: open.id },
          data: { status: "EXPIRED" },
        })
      }
      await afterStep?.("close")

      // 3. A new session, numbered after every earlier attempt
      const attempt = (await tx.payment.count({ where: { orderId } })) + 1
      const request = sessionRequest(order, {
        siteUrl,
        accessToken,
        environment: environment ?? paymentEnvironment(),
        attempt,
        now,
      })
      if (!request.ok) throw refuse("expired")
      const made = await gw.createSession(request.input)
      if (!made.ok) {
        // The closed session's EXPIRED must stay: it is closed at the
        // gateway. So this commits, and answers the error (A7).
        logGatewayFailure("payment.create", made.code)
        return { ok: false, reason: "error" } as const
      }
      created.session = made.session
      await afterStep?.("create")

      // 4. Its Payment row
      await tx.payment.create({
        data: {
          orderId,
          provider: gw.provider,
          providerRef: made.session.id,
          referenceId: request.input.referenceId,
          amount: request.input.amountCentavos,
          currency: request.input.currency,
          expiresAt: made.session.expiresAt,
        },
      })
      await afterStep?.("payment")
      return { ok: true, url: made.session.url } as const
    }, TRANSACTION)
  } catch (error) {
    if (error instanceof Refusal) return error.result
    if (created.session) logOrphanedSession(gw.provider, created.session.id)
    logSafeFailure("Start payment", error)
    return { ok: false, reason: "error" }
  }
}
