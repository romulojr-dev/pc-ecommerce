import { revalidateTag } from "next/cache"
import { after } from "next/server"

import { db } from "@/lib/db"
import { PRODUCTS_TAG } from "@/lib/home"
import { gateway as defaultGateway } from "@/lib/payments/gateway"
import type { PaymentGateway } from "@/lib/payments/gateway-types"
import { reconcileSession } from "@/lib/payments/reconcile"
import type { PaymentEnvironment } from "@/lib/payments/session-request"
import type { Prisma } from "@/generated/prisma/client"

import { logReleaseEvent, logSafeFailure, type ReleaseLogFields } from "./log"
import {
  PURCHASE_BUDGET_MS,
  PURCHASE_GATEWAY_TIMEOUT_MS,
  releaseDecision,
  SCOPED_LIMIT,
  type SessionCheck,
  SWEEP_LIMIT,
} from "./release-rules"

// Releasing unpaid orders (docs/specs/033-release-unpaid-orders, FR-24): an
// order still Pending payment at expiresAt is cancelled and its stock goes
// back.
//
//   1. Check (no transaction): find the due orders, cancel each open session
//      at the gateway; a session that had already ended is reconciled, so a
//      missed payment makes the order Paid instead (D1).
//   2. Release (in a transaction: the purchase's own, or the sweep's): lock
//      the cleared orders that are still due with SKIP LOCKED, cancel them,
//      expire their open payments, return their stock.
//   3. After the commit: revalidate the products tag, log.
//
// Gateway calls never run inside a database transaction (rule Gateway calls).

export type Via = ReleaseLogFields["via"]

export type DueOrder = { id: string; orderNumber: string }

export type CheckResult = {
  // Every open session ended unpaid: step 2 may release these
  cleared: DueOrder[]
  skipped: (DueOrder & { code: string })[]
}

export type ReleaseResult = {
  released: DueOrder[]
  // Cleared, but locked by another transaction or no longer due
  notLocked: string[]
  // Released with no reservation to undo (none exist today)
  noReservation: string[]
}

const NONE: CheckResult = { cleared: [], skipped: [] }

// Reconcile outcomes that settle an order rather than fail to say
const SETTLED: readonly string[] = ["paid", "mismatch"]

// The sweep's own transaction: no HTTP inside, so a short limit
const TRANSACTION = { maxWait: 5_000, timeout: 10_000 } as const

// A gateway whose calls answer "timeout" once `ms` have passed, whatever the
// adapter does: a purchase stops waiting (behavior 7). The call itself may go
// on in the background; its answer is ignored.
export function timedGateway(gw: PaymentGateway, ms: number): PaymentGateway {
  const timed =
    <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
    (...args: A): Promise<R | { ok: false; code: string }> => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<{ ok: false; code: string }>((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, code: "timeout" }), ms)
      })
      return Promise.race([call(...args), timeout]).finally(() =>
        clearTimeout(timer)
      )
    }
  return {
    provider: gw.provider,
    name: gw.name,
    testInstructions: gw.testInstructions,
    createSession: timed(gw.createSession.bind(gw)),
    closeSession: timed(gw.closeSession.bind(gw)),
    getSession: timed(gw.getSession.bind(gw)),
    getPayment: timed(gw.getPayment.bind(gw)),
  }
}

export type CheckOptions = {
  now: Date
  // Only orders holding one of these products (a purchase's scope)
  productIds?: string[]
  limit: number
  // Order ids already tried in this run (the cron's batches)
  exclude?: string[]
  gateway?: PaymentGateway
  environment?: PaymentEnvironment
  // A purchase: the first failure ends the check, and no call starts after
  // the budget (behavior 7)
  purchase?: boolean
}

// Step 1 (behavior 4–8). Writes nothing itself except what reconcileSession
// applies.
export async function checkExpiredOrders({
  now,
  productIds,
  limit,
  exclude = [],
  gateway: gw = defaultGateway(),
  environment,
  purchase = false,
}: CheckOptions): Promise<CheckResult> {
  const scoped = productIds !== undefined
  // One indexed query (the partial index on pending orders' expiresAt); a
  // payment that needs checking keeps its order out (D7)
  const due = await db.$queryRaw<DueOrder[]>`
    SELECT o."id", o."orderNumber"
    FROM "Order" o
    WHERE o."status" = 'PENDING_PAYMENT'
      AND o."expiresAt" <= ${now}
      AND NOT EXISTS (
        SELECT 1 FROM "Payment" p
        WHERE p."orderId" = o."id" AND p."problem" IS NOT NULL)
      AND (${scoped} = false OR EXISTS (
        SELECT 1 FROM "OrderItem" i
        WHERE i."orderId" = o."id"
          AND i."productId" = ANY(${productIds ?? []}::text[])))
      AND NOT (o."id" = ANY(${exclude}::text[]))
    ORDER BY o."expiresAt", o."id"
    LIMIT ${limit}`
  if (due.length === 0) return NONE

  // A PENDING payment always has its session id (the attempt CHECK); an
  // OPENING attempt on a due order is abandoned and has none to close
  // (docs/specs/034-start-payment-outside-transaction, D10)
  const rows = await db.payment.findMany({
    where: {
      orderId: { in: due.map(({ id }) => id) },
      status: "PENDING",
      providerRef: { not: null },
    },
    select: { orderId: true, providerRef: true },
    orderBy: { createdAt: "asc" },
  })
  const open = rows.flatMap(({ orderId, providerRef }) =>
    providerRef ? [{ orderId, providerRef }] : []
  )

  const started = Date.now()
  let stopped: string | null = null
  const result: CheckResult = { cleared: [], skipped: [] }

  for (const order of due) {
    const sessions = open.filter(({ orderId }) => orderId === order.id)
    const checks: SessionCheck[] = []
    for (const { providerRef } of sessions) {
      if (purchase && !stopped && Date.now() - started >= PURCHASE_BUDGET_MS) {
        stopped = "budget"
      }
      if (stopped) {
        checks.push({ kind: "failed", code: stopped })
        break
      }
      const check = await checkSession(gw, providerRef, now, environment)
      checks.push(check)
      const decision = releaseDecision([check])
      if (decision.release) continue
      // A purchase calls the gateway no more after a failure (an order that
      // just became Paid or flagged isn't one); this order is decided either
      // way
      if (purchase && !SETTLED.includes(decision.code)) stopped = "budget"
      break
    }
    const decision = releaseDecision(checks)
    if (decision.release) result.cleared.push(order)
    else result.skipped.push({ ...order, code: decision.code })
  }
  return result
}

// Cancel the session; one that had already ended is reconciled
async function checkSession(
  gw: PaymentGateway,
  sessionId: string,
  now: Date,
  environment: PaymentEnvironment | undefined
): Promise<SessionCheck> {
  const closed = await gw.closeSession(sessionId)
  if (!closed.ok) return { kind: "failed", code: closed.code }
  if (closed.outcome === "cancelled") return { kind: "cancelled" }
  const { outcome } = await reconcileSession(sessionId, {
    gateway: gw,
    now,
    ...(environment && { environment }),
  })
  return { kind: "reconciled", outcome }
}

// Step 2 (behavior 9–13), in the caller's transaction. Only orders still due
// are changed, so a webhook that made one Paid between the steps wins, and
// running twice releases once.
export async function releaseExpiredOrders(
  tx: Prisma.TransactionClient,
  { now, orderIds }: { now: Date; orderIds: string[] }
): Promise<ReleaseResult> {
  if (orderIds.length === 0) {
    return { released: [], notLocked: [], noReservation: [] }
  }
  const locked = await tx.$queryRaw<DueOrder[]>`
    SELECT o."id", o."orderNumber"
    FROM "Order" o
    WHERE o."id" = ANY(${orderIds}::text[])
      AND o."status" = 'PENDING_PAYMENT'
      AND o."expiresAt" <= ${now}
      AND NOT EXISTS (
        SELECT 1 FROM "Payment" p
        WHERE p."orderId" = o."id" AND p."problem" IS NOT NULL)
    ORDER BY o."id"
    FOR UPDATE OF o SKIP LOCKED`
  const ids = locked.map(({ id }) => id)
  const notLocked = orderIds.filter((id) => !ids.includes(id))
  if (ids.length === 0) return { released: [], notLocked, noReservation: [] }

  await tx.order.updateMany({
    where: { id: { in: ids } },
    data: { status: "CANCELLED", cancelledAt: now, cancelReason: "EXPIRED" },
  })
  // The sessions step 1 cancelled; one a webhook already moved stays as it is
  await tx.payment.updateMany({
    where: { orderId: { in: ids }, status: "PENDING" },
    data: { status: "EXPIRED" },
  })
  // An OPENING attempt on a due order is always abandoned (it was claimed at
  // least 10 minutes before the deadline, and abandoned after 60 s): it has
  // no session to close (docs/specs/034-start-payment-outside-transaction,
  // D10)
  await tx.payment.updateMany({
    where: { orderId: { in: ids }, status: "OPENING" },
    data: { status: "FAILED" },
  })

  // Undo the reservations row for row (D9), one stock update per product in
  // id order, the order placement takes them in
  const reserved = await tx.stockMovement.findMany({
    where: { orderId: { in: ids }, reason: "ORDER_RESERVED" },
    select: { orderId: true, productId: true, change: true },
  })
  const back = new Map<string, number>()
  for (const { productId, change } of reserved) {
    back.set(productId, (back.get(productId) ?? 0) - change)
  }
  for (const productId of [...back.keys()].sort()) {
    await tx.$executeRaw`
      UPDATE "Product"
      SET "stock" = "stock" + ${back.get(productId)!}, "updatedAt" = now()
      WHERE "id" = ${productId}`
  }
  if (reserved.length > 0) {
    await tx.stockMovement.createMany({
      data: reserved.map(({ orderId, productId, change }) => ({
        productId,
        change: -change,
        reason: "ORDER_RELEASED" as const,
        orderId,
      })),
    })
  }

  const withReservation = new Set(reserved.map(({ orderId }) => orderId))
  return {
    released: locked,
    notLocked,
    noReservation: ids.filter((id) => !withReservation.has(id)),
  }
}

// Step 3 (behavior 14–15): never throws, never calls the gateway. Without a
// release (nothing cleared, or the purchase rolled back) only the skipped
// orders are logged.
export function afterRelease(
  check: CheckResult,
  release: ReleaseResult | null,
  { via }: { via: Via }
): void {
  if (release && release.released.length > 0) {
    try {
      revalidateTag(PRODUCTS_TAG, "max")
    } catch (error) {
      logSafeFailure("Revalidating products after a release", error)
    }
  }
  for (const order of release?.released ?? []) {
    logReleaseEvent({
      outcome: "released",
      orderNumber: order.orderNumber,
      via,
      ...(release!.noReservation.includes(order.id) && {
        code: "no-reservation",
      }),
    })
  }
  for (const order of check.cleared) {
    if (release?.notLocked.includes(order.id)) {
      logReleaseEvent({
        outcome: "skipped",
        orderNumber: order.orderNumber,
        via,
        code: "locked",
      })
    }
  }
  for (const order of check.skipped) {
    logReleaseEvent({
      outcome: "skipped",
      orderNumber: order.orderNumber,
      via,
      code: order.code,
    })
  }
}

export type SweepResult = {
  released: number
  skipped: number
  // Every order this run looked at, for the cron's next batch
  tried: string[]
  // A database step failed (logged)
  failed: boolean
}

// Steps 1–3 with the sweep's own transaction: after pages (via `after()`) and
// from the cron. Never throws.
export async function sweepExpiredOrders(
  now: Date,
  {
    limit = SWEEP_LIMIT,
    exclude = [],
    gateway,
    environment,
    via = "sweep",
  }: {
    limit?: number
    exclude?: string[]
    gateway?: PaymentGateway
    environment?: PaymentEnvironment
    via?: Via
  } = {}
): Promise<SweepResult> {
  try {
    const check = await checkExpiredOrders({
      now,
      limit,
      exclude,
      gateway,
      environment,
    })
    const tried = [...check.cleared, ...check.skipped].map(({ id }) => id)
    const orderIds = check.cleared.map(({ id }) => id)
    const release =
      orderIds.length > 0
        ? await db.$transaction(
            (tx) => releaseExpiredOrders(tx, { now, orderIds }),
            TRANSACTION
          )
        : null
    afterRelease(check, release, { via })
    return {
      released: release?.released.length ?? 0,
      skipped: check.skipped.length + (release?.notLocked.length ?? 0),
      tried,
      failed: false,
    }
  } catch (error) {
    logSafeFailure("Releasing unpaid orders", error)
    return { released: 0, skipped: 0, tried: [], failed: true }
  }
}

// The sweep after a server-rendered page or route (behavior 22–23): `now` is
// read during the request, and the work runs after the response, so the page
// never waits. Inside after() revalidateTag is allowed and flushed.
export function sweepAfterResponse(now = new Date()): void {
  after(() => sweepExpiredOrders(now).then(() => undefined))
}

// A purchase's release (behavior 17–20), in three calls around its own
// transaction:
//
//   const pending = await prepareRelease(productIds, { now })   // step 1
//   db.$transaction(async (tx) => {
//     …lock the cart…
//     await releaseInPurchase(tx, pending)                     // step 2
//     …its own stock check…
//   })
//   finishRelease(pending, committed)                          // step 3
//
// A failure in step 1 never fails the purchase: it goes on with nothing
// cleared. A purchase that rolls back releases nothing.
export type PendingRelease = {
  now: Date
  check: CheckResult
  release: ReleaseResult | null
}

export async function prepareRelease(
  productIds: string[],
  {
    now = new Date(),
    gateway,
    environment,
    timeoutMs = PURCHASE_GATEWAY_TIMEOUT_MS,
  }: {
    now?: Date
    gateway?: PaymentGateway
    environment?: PaymentEnvironment
    timeoutMs?: number
  } = {}
): Promise<PendingRelease> {
  const pending: PendingRelease = { now, check: NONE, release: null }
  if (productIds.length === 0) return pending
  try {
    const check = await checkExpiredOrders({
      now,
      productIds,
      limit: SCOPED_LIMIT,
      gateway: timedGateway(gateway ?? defaultGateway(), timeoutMs),
      environment,
      purchase: true,
    })
    return { ...pending, check }
  } catch (error) {
    logSafeFailure("Checking expired orders for a purchase", error)
    return pending
  }
}

// Step 2 in the purchase's transaction, right after its cart lock. True when
// anything was released.
export async function releaseInPurchase(
  tx: Prisma.TransactionClient,
  pending: PendingRelease
): Promise<boolean> {
  const orderIds = pending.check.cleared.map(({ id }) => id)
  if (orderIds.length === 0) return false
  pending.release = await releaseExpiredOrders(tx, {
    now: pending.now,
    orderIds,
  })
  return pending.release.released.length > 0
}

// Step 3, once the purchase's transaction has finished
export function finishRelease(
  pending: PendingRelease,
  committed: boolean
): void {
  afterRelease(pending.check, committed ? pending.release : null, {
    via: "purchase",
  })
}
