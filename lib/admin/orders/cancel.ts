import "server-only"

import { revalidateTag } from "next/cache"

import { adminTransaction, recordAudit } from "@/lib/admin/audit"
import type { AdminActor } from "@/lib/admin/guard"
import { db } from "@/lib/db"
import { enqueueEmail } from "@/lib/email/outbox"
import { scheduleEmailSend } from "@/lib/email/schedule"
import { PRODUCTS_TAG } from "@/lib/home"
import { type CancelInput, canCancel } from "@/lib/orders/cancel"
import { logSafeFailure } from "@/lib/orders/log"
import { checkSession } from "@/lib/orders/release"
import { undoReservations } from "@/lib/orders/undo-reservations"
import { giveBackVoucherUses } from "@/lib/orders/voucher-use"
import { gateway as defaultGateway } from "@/lib/payments/gateway"
import type { PaymentGateway } from "@/lib/payments/gateway-types"
import type { PaymentEnvironment } from "@/lib/payments/session-request"

// Cancelling an order from Admin (docs/specs/044-admin-cancel-order, B14–B19).
// The server action only forwards here, after the guard has checked the
// origin, the session and `can()`.
//
//   1. Read the order (no transaction). Stop on stale, not allowed or a
//      payment problem, before any gateway call.
//   2. Close every open payment session at the gateway (no transaction),
//      whatever the order's status. A session that turns out paid, a failure
//      to close, or a payment left flagged refuses the cancel.
//   3. One transaction: ONE conditional UPDATE on the status the screen
//      showed. No row changed is stale and nothing else runs. Otherwise the
//      payments end, the stock and the voucher use go back, and the audit
//      entry and the email's outbox row are written with it.
//   4. After the commit (finishCancel): send the email, revalidate the
//      products tag when stock came back.

export type CancelResult =
  | {
      kind: "done"
      orderNumber: string
      refundRequired: boolean
      // The outbox row to send after the commit, or null (already queued)
      emailId: string | null
      // Whether the order had a reservation to give back (revalidate then)
      stockReturned: boolean
    }
  | { kind: "stale" }
  | { kind: "not-allowed" }
  | { kind: "not-found" }
  // A payment with a problem: #111 resolves it
  | { kind: "needs-review" }
  // A session was paid, so the order is now Paid and was not cancelled
  | { kind: "paid-meanwhile" }
  // The payment provider could not be asked, so nothing was cancelled
  | { kind: "gateway-failed" }

// Thrown inside the transaction to roll it back with a refusal
class Refusal extends Error {
  constructor(readonly result: CancelResult) {
    super(result.kind)
  }
}

export type CancelOptions = {
  now?: Date
  gateway?: PaymentGateway
  environment?: PaymentEnvironment
}

export async function cancelOrder(
  actor: AdminActor,
  input: CancelInput,
  {
    now = new Date(),
    gateway = defaultGateway(),
    environment,
  }: CancelOptions = {}
): Promise<CancelResult> {
  // 1. Read, no transaction
  const order = await db.order.findUnique({
    where: { orderNumber: input.orderNumber },
    select: {
      id: true,
      status: true,
      paidAt: true,
      payments: { select: { status: true, providerRef: true, problem: true } },
    },
  })
  if (!order) return { kind: "not-found" }
  if (order.status !== input.expectedStatus) return { kind: "stale" }
  if (!canCancel({ status: order.status })) return { kind: "not-allowed" }
  if (order.payments.some((payment) => payment.problem !== null)) {
    return { kind: "needs-review" }
  }

  // 2. Close every open session (no transaction)
  for (const payment of order.payments) {
    if (payment.status !== "PENDING" || payment.providerRef === null) continue
    const check = await checkSession(
      gateway,
      payment.providerRef,
      now,
      environment
    )
    if (check.kind === "cancelled") continue
    if (check.kind === "failed") return { kind: "gateway-failed" }
    if (check.outcome === "expired" || check.outcome === "already-applied") {
      continue
    }
    // The order became Paid just now: reload and cancel it as a paid order
    if (check.outcome === "paid") return { kind: "paid-meanwhile" }
    // Flagged, or a second or late payment: needs checking (#111)
    if (
      check.outcome === "mismatch" ||
      check.outcome === "second" ||
      check.outcome === "late"
    ) {
      return { kind: "needs-review" }
    }
    // Not decided yet, or unconfirmed: the provider could not say
    return { kind: "gateway-failed" }
  }

  // 3. The transaction
  const refundRequired = order.paidAt !== null
  const note = input.reason === "OTHER" ? input.note : undefined
  try {
    return await adminTransaction(async (tx): Promise<CancelResult> => {
      const changed = await tx.order.updateMany({
        where: { id: order.id, status: input.expectedStatus },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancelReason: input.reason,
          ...(refundRequired ? { refundRequired: true } : {}),
        },
      })
      if (changed.count === 0) return { kind: "stale" }

      // A payment flagged since the read (the order row is locked now)
      const flagged = await tx.payment.count({
        where: { orderId: order.id, problem: { not: null } },
      })
      if (flagged > 0) throw new Refusal({ kind: "needs-review" })

      await tx.payment.updateMany({
        where: { orderId: order.id, status: "PENDING" },
        data: { status: "EXPIRED" },
      })
      // An attempt still opening has no session to close; it ends here
      await tx.payment.updateMany({
        where: { orderId: order.id, status: "OPENING" },
        data: { status: "FAILED" },
      })

      const { withReservation } = await undoReservations(tx, [order.id], {
        actorId: actor.id,
      })
      // After the stock (products are locked first, then vouchers), whatever
      // the voucher's dates are now
      await giveBackVoucherUses(tx, [order.id])

      await recordAudit(tx, {
        actorId: actor.id,
        entity: "order",
        entityId: order.id,
        action: "cancelled",
        before: { status: input.expectedStatus },
        after: {
          status: "CANCELLED",
          cancelReason: input.reason,
          refundRequired,
          ...(note !== undefined ? { note } : {}),
        },
      })

      const email = await enqueueEmail(tx, order.id, "ORDER_CANCELLED_BY_STORE")
      return {
        kind: "done",
        orderNumber: input.orderNumber,
        refundRequired,
        emailId: email?.id ?? null,
        stockReturned: withReservation.has(order.id),
      }
    })
  } catch (error) {
    if (error instanceof Refusal) return error.result
    throw error
  }
}

// After the commit: send the email and, when stock came back, revalidate the
// products tag. Never throws and never reverses the cancel (R10).
export function finishCancel(result: CancelResult): void {
  if (result.kind !== "done") return
  if (result.emailId) scheduleEmailSend(result.emailId)
  if (result.stockReturned) {
    try {
      revalidateTag(PRODUCTS_TAG, "max")
    } catch (error) {
      logSafeFailure("Revalidating products after a cancel", error)
    }
  }
}
