import { db } from "@/lib/db"
import { env } from "@/lib/env"
import {
  linkCredential,
  type ParsedCredential,
  toCredential,
} from "@/lib/orders/credential"
import { logSafeFailure } from "@/lib/orders/log"
import { mintViewLink } from "@/lib/orders/order-links"

import { attemptState, START_TRANSACTION } from "./attempt"
import { gateway, paymentEnvironment } from "./gateway"
import type { CreatedSession, PaymentGateway } from "./gateway-types"
import { logGatewayFailure, logOrphanedSession } from "./log"
import { canStartSession } from "./payable"
import {
  type PaymentEnvironment,
  type SessionInput,
  sessionRequest,
} from "./session-request"

// Start a payment for an order: Pay now, Retry payment, and the step after
// Place order (docs/specs/031-pay-with-xendit, Behavior 13–14; ADR 0010). The
// one writer of Payment rows for new sessions. No gateway call runs while a
// transaction is open (docs/specs/034-start-payment-outside-transaction):
//
//   claim:  lock the order → payable? → record an OPENING attempt → commit
//   then:   close the open session → create a session (no transaction)
//   settle: lock the order → the old payment EXPIRED once its session is
//           closed → the attempt PENDING with its session, or FAILED
//
// The OPENING attempt is the claim: while it is fresh, another start of the
// same order answers "opening" and its page waits and asks again, so a double
// click, a second tab or a replayed Place order opens one session at a time.
// An attempt left OPENING by a crash is abandoned after 60 s on the database
// clock, and the next start takes it over.

export type StartResult =
  | { ok: true; url: string }
  | {
      ok: false
      reason:
        // Another start of this order is opening a session: wait and ask
        // again (docs/specs/034-start-payment-outside-transaction)
        | "opening"
        | "confirming"
        | "expired"
        | "not-pending"
        | "needs-check"
        | "not-found"
        | "error"
    }

type Refused = Extract<StartResult, { ok: false }>

export type StartStep = "claim" | "close" | "create" | "attach"

export type StartOptions = {
  now?: Date
  gateway?: PaymentGateway
  siteUrl?: string
  environment?: PaymentEnvironment
  // Test seam: runs after each step; inside the transaction for "claim" and
  // "attach" (every settle), outside for "close" and "create"
  afterStep?: (step: StartStep) => void | Promise<void>
}

const refused = (reason: Refused["reason"]): Refused => ({
  ok: false,
  reason,
})

type LockedOrder = {
  id: string
  orderNumber: string
  status: string
  total: number
  expiresAt: Date
  // The database's now(), so an attempt's age never depends on this server's
  // clock (spec 034, D4)
  dbNow: Date
}

type Claimed = {
  attemptId: string
  // The order's open session, to close before the new one is made
  open: { id: string; providerRef: string } | null
  input: SessionInput
}

// `credential` is how the caller opened the order: its access token (a bare
// string is one) or a signed `view` link. The return URLs carry the token as
// it is, or a link signed now (docs/specs/035-email-foundation-signed-links,
// D5), so a link nearly out of time can't strand the shopper at the gateway.
export async function startPayment(
  orderId: string,
  credentialIn: string | ParsedCredential,
  {
    now = new Date(),
    gateway: chosen,
    siteUrl = env.NEXT_PUBLIC_SITE_URL,
    environment,
    afterStep,
  }: StartOptions = {}
): Promise<StartResult> {
  const gw = chosen ?? gateway()
  const given = toCredential(credentialIn)
  if (given.kind !== "token" && given.kind !== "link") {
    return refused("not-found")
  }

  // 1. Claim
  let claimed: Claimed | Refused
  try {
    claimed = await db.$transaction(async (tx): Promise<Claimed | Refused> => {
      const [order] = await tx.$queryRaw<LockedOrder[]>`
        SELECT "id", "orderNumber", "status"::text AS "status", "total",
          "expiresAt", now() AS "dbNow"
        FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
      if (!order) return refused("not-found")
      if (order.status !== "PENDING_PAYMENT") return refused("not-pending")
      if (!canStartSession(order.expiresAt, now)) return refused("expired")
      // A payment whose amount didn't match is being checked: no new one
      // (docs/specs/032-payment-webhooks, behavior 24, S9)
      const mismatch = await tx.payment.count({
        where: { orderId, problem: "AMOUNT_MISMATCH" },
      })
      if (mismatch > 0) return refused("needs-check")

      // Another start in flight: wait for it, unless it was abandoned
      const opening = await tx.payment.findFirst({
        where: { orderId, status: "OPENING" },
        select: { id: true, status: true, createdAt: true },
      })
      if (opening) {
        if (attemptState(opening, order.dbNow) === "opening") {
          return refused("opening")
        }
        await tx.payment.updateMany({
          where: { id: opening.id, status: "OPENING" },
          data: { status: "FAILED" },
        })
      }

      // A PENDING payment always has its session id (the attempt CHECK)
      const open = await tx.payment.findFirst({
        where: { orderId, status: "PENDING", providerRef: { not: null } },
        select: { id: true, providerRef: true },
      })
      // Numbered after every earlier attempt, failed ones included, so a
      // reference is never reused (Xendit has no idempotency key)
      const attempt = (await tx.payment.count({ where: { orderId } })) + 1
      const request = sessionRequest(order, {
        siteUrl,
        credential:
          given.kind === "link"
            ? linkCredential(mintViewLink(order.orderNumber, now))
            : given,
        environment: environment ?? paymentEnvironment(),
        attempt,
        now,
      })
      if (!request.ok) return refused("expired")
      const row = await tx.payment.create({
        data: {
          orderId,
          provider: gw.provider,
          status: "OPENING",
          referenceId: request.input.referenceId,
          amount: request.input.amountCentavos,
          currency: request.input.currency,
          // The requested expiry until the gateway's replaces it
          expiresAt: request.input.expiresAt,
          // Set here: Prisma would fill @default(now()) from this server's
          // clock, and the age is judged on the database's
          createdAt: order.dbNow,
        },
        select: { id: true },
      })
      await afterStep?.("claim")
      return {
        attemptId: row.id,
        open: open?.providerRef
          ? { id: open.id, providerRef: open.providerRef }
          : null,
        input: request.input,
      }
    }, START_TRANSACTION)
  } catch (error) {
    logSafeFailure("Start payment", error)
    return refused("error")
  }
  if ("ok" in claimed) return claimed

  const { attemptId, open, input } = claimed
  const settle = (closedOldId: string | null, session?: CreatedSession) =>
    settleAttempt({ orderId, attemptId, closedOldId, session, afterStep })

  // A stop before a session exists: the attempt FAILED, and the old payment
  // EXPIRED once its session is closed. If even that fails, the attempt
  // stays OPENING and is abandoned after 60 s.
  const finish = async (
    reason: "error" | "confirming",
    closedOldId: string | null
  ): Promise<Refused> => {
    try {
      await settle(closedOldId)
    } catch (error) {
      logSafeFailure("Start payment", error)
    }
    return refused(reason)
  }

  // A session no payment will hold: its link was never handed out, so close
  // it (best effort; spec 034, D7)
  const closeOrphan = async (session: CreatedSession) => {
    logOrphanedSession(gw.provider, session.id)
    try {
      const closed = await gw.closeSession(session.id)
      if (!closed.ok) logGatewayFailure("payment.close", closed.code)
    } catch (error) {
      logSafeFailure("Close orphaned session", error)
    }
  }

  let closedOldId: string | null = null
  let session: CreatedSession
  try {
    // 2. Close the open session. If it was paid first, a payment is on its
    //    way: no new session (spec 031, Behavior 13.2).
    if (open) {
      const closed = await gw.closeSession(open.providerRef)
      if (!closed.ok) {
        logGatewayFailure("payment.close", closed.code)
        return await finish("error", null)
      }
      // Already ended: if it was paid, a payment is on its way
      if (closed.outcome === "not-active") {
        const read = await gw.getSession(open.providerRef)
        if (!read.ok || !read.session) {
          logGatewayFailure("payment.close", read.ok ? "not-found" : read.code)
          return await finish("error", null)
        }
        if (read.session.status === "completed") {
          return await finish("confirming", null)
        }
      }
      closedOldId = open.id
    }
    await afterStep?.("close")

    // 3. A new session. A lost answer may still have made one at the
    //    gateway: Xendit can't find it by reference id, so it is an orphan
    //    nobody has the link to, and it expires with the order (spec 034,
    //    D11).
    const made = await gw.createSession(input)
    if (!made.ok) {
      logGatewayFailure("payment.create", made.code)
      return await finish("error", closedOldId)
    }
    session = made.session
    await afterStep?.("create")
  } catch (error) {
    logSafeFailure("Start payment", error)
    return finish("error", closedOldId)
  }

  // 4. Attach it, unless the order moved on or the attempt was taken over
  let outcome: Settled
  try {
    outcome = await settle(closedOldId, session)
  } catch (error) {
    logSafeFailure("Start payment", error)
    // Once more without the session, so a Retry needn't wait 60 s
    try {
      await settle(closedOldId)
    } catch (again) {
      logSafeFailure("Start payment", again)
    }
    await closeOrphan(session)
    return refused("error")
  }
  if (outcome === "attached") return { ok: true, url: session.url }
  await closeOrphan(session)
  return refused(outcome === "not-pending" ? "not-pending" : "error")
}

type Settled = "attached" | "not-pending" | "taken-over" | "failed"

// The second short transaction: the old payment EXPIRED (it comes first, so
// the one-PENDING index never sees two), then the attempt PENDING with its
// session, or FAILED. Every move out of OPENING is conditional, so an attempt
// another start took over never comes back.
async function settleAttempt({
  orderId,
  attemptId,
  closedOldId,
  session,
  afterStep,
}: {
  orderId: string
  attemptId: string
  closedOldId: string | null
  session?: CreatedSession
  afterStep?: StartOptions["afterStep"]
}): Promise<Settled> {
  return db.$transaction(async (tx): Promise<Settled> => {
    const [order] = await tx.$queryRaw<{ status: string }[]>`
      SELECT "status"::text AS "status"
      FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
    if (closedOldId) {
      // A webhook may have moved it already
      await tx.payment.updateMany({
        where: { id: closedOldId, status: "PENDING" },
        data: { status: "EXPIRED" },
      })
    }
    let outcome: Settled
    if (session && order?.status === "PENDING_PAYMENT") {
      const { count } = await tx.payment.updateMany({
        where: { id: attemptId, status: "OPENING" },
        data: {
          status: "PENDING",
          providerRef: session.id,
          expiresAt: session.expiresAt,
        },
      })
      outcome = count === 1 ? "attached" : "taken-over"
    } else {
      await tx.payment.updateMany({
        where: { id: attemptId, status: "OPENING" },
        data: { status: "FAILED" },
      })
      outcome = session ? "not-pending" : "failed"
    }
    await afterStep?.("attach")
    return outcome
  }, START_TRANSACTION)
}
