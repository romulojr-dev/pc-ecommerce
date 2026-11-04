import { db } from "@/lib/db"

import { confirmView } from "./cod-confirm-view"
import { logCodEvent, logSafeFailure } from "./log"
import { orderNumberShape } from "./number"
import { verifyCodConfirmLink } from "./order-links"
import { type LinkParams, linkShape } from "./signed-link"
import type { OrderStatusName, PaymentOptionName } from "./timeline"

// Confirming a cash order (docs/specs/038-cash-on-delivery, Behavior 17–19).
// The one writer of COD confirmed: the server action only forwards here.
//
// The link proves the shopper holds the emailed `cod-confirm` link; the row
// decides what happens. One conditional UPDATE moves the order Pending
// confirmation → COD confirmed and sets `confirmedAt`, but only while the
// order is still Pending confirmation and before its deadline. The statement
// takes the row lock, as the release does, and each re-checks the status under
// it, so a confirmation racing the release has exactly one winner. Anyone can
// reach the action, so a link of the wrong shape is refused before any read,
// and every other miss (a bad signature, another purpose, an unknown order, an
// online order) is the same `not-found` at the same cost: one read, and the
// signature checked whether or not the order exists.

export type ConfirmResult =
  // `already`: it was confirmed before (a double click, a second tab): a
  // no-op, nothing written
  | { ok: true; outcome: "confirmed" | "already" }
  | { ok: false; reason: "expired" | "not-found" | "error" }

// The link's three query values, as the page or the action got them
export type RawLink = { sig: unknown; exp: unknown; p: unknown }

// The link when it has the right shape. The purpose is checked with the
// signature, so a `view` link is refused only after the read, like any
// forgery.
export function codLinkParams(link: RawLink): LinkParams | null {
  return linkShape(link) ? link : null
}

type Row = {
  status: OrderStatusName
  expiresAt: Date
  paymentOption: PaymentOptionName
  id: string
}

const read = (orderNumber: string): Promise<Row | null> =>
  db.order.findUnique({
    where: { orderNumber },
    select: { id: true, status: true, expiresAt: true, paymentOption: true },
  })

export async function confirmCodOrder(
  orderNumber: unknown,
  link: RawLink,
  // The one clock of the call: the checks and the update both use it
  now = new Date()
): Promise<ConfirmResult> {
  const params = codLinkParams(link)
  if (!orderNumberShape(orderNumber) || !params) {
    logCodEvent({ outcome: "not-found" })
    return { ok: false, reason: "not-found" }
  }

  try {
    const order = await read(orderNumber)
    // Computed whether or not the order exists
    const verdict = verifyCodConfirmLink(orderNumber, params, now)
    const view = confirmView(verdict, order, now)

    if (view === "not-found" || !order) {
      logCodEvent({ outcome: "not-found" })
      return { ok: false, reason: "not-found" }
    }
    if (view === "cancelled") {
      logCodEvent({ outcome: "expired", orderNumber })
      return { ok: false, reason: "expired" }
    }
    if (view === "confirmed") {
      logCodEvent({ outcome: "already", orderNumber })
      return { ok: true, outcome: "already" }
    }

    // The one write. `now` is bound, never the database's clock, so the
    // deadline boundary is the same in the check above and here.
    const updated = await db.$queryRaw<{ id: string }[]>`
      UPDATE "Order"
      SET "status" = 'COD_CONFIRMED', "confirmedAt" = ${now}, "updatedAt" = ${now}
      WHERE "id" = ${order.id}
        AND "status" = 'PENDING_CONFIRMATION'
        AND "expiresAt" > ${now}
      RETURNING "id"`
    if (updated.length === 1) {
      logCodEvent({ outcome: "confirmed", orderNumber })
      return { ok: true, outcome: "confirmed" }
    }

    // No row: something got there first. Say what it was.
    const after = confirmView("ok", await read(orderNumber), now)
    if (after === "confirmed") {
      logCodEvent({ outcome: "already", orderNumber })
      return { ok: true, outcome: "already" }
    }
    logCodEvent({ outcome: "expired", orderNumber })
    return { ok: false, reason: "expired" }
  } catch (error) {
    logSafeFailure("Confirm cash order", error)
    return { ok: false, reason: "error" }
  }
}
