import "server-only"

import type { EmailType } from "@/generated/prisma/client"
import { type AdminActor } from "@/lib/admin/guard"
import { adminTransaction, recordAudit } from "@/lib/admin/audit"
import { enqueueEmail } from "@/lib/email/outbox"
import {
  canTransition,
  emailTypeFor,
  recordsCashPayment,
  TIMESTAMP_FIELD,
  type TransitionTarget,
} from "@/lib/orders/transitions"
import type { TransitionInput } from "@/lib/orders/transition-input"

// Moving an order through fulfillment (docs/specs/043-order-fulfillment-
// transitions, B14–B17, R3, R4, R7, R8, R12). The server action only forwards
// here, after the guard has checked the origin, the session and `can()`.
//
// One transaction, database work only: read the order's fixed fields, check
// the table against the status the staff member saw, then ONE conditional
// UPDATE on that status. No row changed means the order moved meanwhile:
// nothing else runs (no audit row, no email row, no cash `paidAt`). Otherwise
// the audit entry and the email's outbox row are written in the same
// transaction, so neither exists for a move that did not happen. The caller
// schedules the send after the commit.

export type TransitionResult =
  | {
      kind: "done"
      status: TransitionTarget
      // The outbox row to send after the commit, or null (no email, or the
      // email was already queued)
      emailId: string | null
      emails: boolean
    }
  | { kind: "stale" }
  | { kind: "not-allowed" }
  | { kind: "not-found" }

export async function transitionOrder(
  actor: AdminActor,
  input: TransitionInput,
  // The one clock of the call: every timestamp it writes
  now: Date = new Date()
): Promise<TransitionResult> {
  const to = input.to as TransitionTarget
  return adminTransaction(async (tx): Promise<TransitionResult> => {
    const order = await tx.order.findUnique({
      where: { orderNumber: input.orderNumber },
      select: { id: true, fulfillment: true, paymentOption: true },
    })
    if (!order) return { kind: "not-found" }

    const seen = {
      status: input.expectedStatus,
      fulfillment: order.fulfillment,
      paymentOption: order.paymentOption,
    }
    if (!canTransition(seen, to)) return { kind: "not-allowed" }

    const cash = recordsCashPayment(seen, to)
    const shipped =
      to === "SHIPPED"
        ? { courier: input.courier, trackingNumber: input.trackingNumber }
        : {}
    const changed = await tx.order.updateMany({
      where: { id: order.id, status: input.expectedStatus },
      data: {
        status: to,
        [TIMESTAMP_FIELD[to]]: now,
        ...shipped,
        ...(cash ? { paidAt: now } : {}),
      },
    })
    if (changed.count === 0) return { kind: "stale" }

    await recordAudit(tx, {
      actorId: actor.id,
      entity: "order",
      entityId: order.id,
      action: "status-changed",
      before: { status: input.expectedStatus },
      after: {
        status: to,
        ...shipped,
        ...(cash ? { paidAt: now.toISOString() } : {}),
      },
    })

    const type = emailTypeFor(to)
    const queued = type
      ? await enqueueEmail(tx, order.id, type as EmailType)
      : null
    return {
      kind: "done",
      status: to,
      emailId: queued?.id ?? null,
      emails: type !== null,
    }
  })
}
