import type { EmailType, Prisma } from "@/generated/prisma/client"

import { recipientHash } from "./recipient"

// Writing to the outbox (docs/specs/035-email-foundation-signed-links,
// Behavior 1). Called from inside the transaction that causes the email
// (placement, reconcile, release; those calls are #93 and #95), so a rolled
// back trigger leaves no row. It makes no network call.

export type Enqueued = { id: string }

// One row per `(orderId, type)`: `INSERT … ON CONFLICT DO NOTHING RETURNING`
// with no conflict target (`skipDuplicates`), never a caught P2002, which
// Postgres could not recover from inside a transaction (ADR 0007). Returns
// the new row, or null when the email was already enqueued. The address is
// read from the order, and only its hash is stored.
export async function enqueueEmail(
  tx: Prisma.TransactionClient,
  orderId: string,
  type: EmailType
): Promise<Enqueued | null> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { guestEmail: true },
  })
  // A bug in the caller: it enqueues for the order it just wrote
  if (!order) throw new Error("enqueueEmail: no such order")
  const [row] = await tx.emailOutbox.createManyAndReturn({
    data: [{ orderId, type, recipientHash: recipientHash(order.guestEmail) }],
    skipDuplicates: true,
    select: { id: true },
  })
  return row ?? null
}
