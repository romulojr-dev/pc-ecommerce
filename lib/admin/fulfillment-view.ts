import { formatPeso } from "@/lib/format"
import {
  emailTypeFor,
  recordsCashPayment,
  type TransitionOrder,
  type TransitionTarget,
  transitionsFor,
} from "@/lib/orders/transitions"
import { canCancel, nothingReceived } from "@/lib/orders/cancel"
import { statusLabel } from "@/lib/orders/timeline"

import { FULFILLMENT_COPY } from "./fulfillment-copy"

// What the Fulfillment section shows for an order (docs/specs/043-order-
// fulfillment-transitions, B4, B5, B13). Pure: the panel only draws it.

export type FulfillmentChoice = {
  to: TransitionTarget
  button: string
  // Shipped asks for the courier and tracking number first (B6)
  ship: boolean
  // The lines the confirmation lists
  lines: string[]
  // The new status as the confirmation names it ("shipped")
  statusName: string
}

export type FulfillmentView = {
  // The one allowed move, or null
  choice: FulfillmentChoice | null
  // Why there is no button (B13); null when there is one
  reason: string | null
}

export function fulfillmentView(
  order: TransitionOrder & { total: number }
): FulfillmentView {
  const [to] = transitionsFor(order)
  if (!to) {
    return {
      choice: null,
      reason: FULFILLMENT_COPY.reasons[order.status] ?? null,
    }
  }
  const ship = to === "SHIPPED"
  const lines = [
    FULFILLMENT_COPY.noUndo,
    ...(ship ? [FULFILLMENT_COPY.detailsEmailed] : []),
    emailTypeFor(to) ? FULFILLMENT_COPY.emailed : FULFILLMENT_COPY.notEmailed,
    ...(recordsCashPayment(order, to)
      ? [FULFILLMENT_COPY.cashPaid(formatPeso(order.total))]
      : []),
  ]
  return {
    choice: {
      to,
      button: FULFILLMENT_COPY.buttons[to],
      ship,
      lines,
      statusName: statusLabel(to).toLowerCase(),
    },
    reason: null,
  }
}

// What the action's answer means for the dialog
export type TransitionAnswer =
  | {
      ok: true
      data:
        | { kind: "done"; status: TransitionTarget }
        | { kind: "stale" | "not-allowed" | "not-found" }
    }
  | { ok: false; message: string }

export type Outcome =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string; stale: boolean }

export function outcomeOf(answer: TransitionAnswer): Outcome {
  if (!answer.ok) return { kind: "error", text: answer.message, stale: false }
  switch (answer.data.kind) {
    case "done":
      return {
        kind: "success",
        text: FULFILLMENT_COPY.success[answer.data.status],
      }
    case "stale":
      return { kind: "error", text: FULFILLMENT_COPY.stale, stale: true }
    case "not-allowed":
      return { kind: "error", text: FULFILLMENT_COPY.notAllowed, stale: false }
    case "not-found":
      return { kind: "error", text: FULFILLMENT_COPY.notFound, stale: false }
  }
}

// ---- Cancel (docs/specs/044-admin-cancel-order, B5, B6) ----

export type CancelView =
  // Not cancellable from this status: no button
  | { kind: "none" }
  // A payment with a problem: no button, a line (B5)
  | { kind: "blocked"; text: string }
  | { kind: "available"; effects: string[] }

export function cancelView(order: {
  status: TransitionOrder["status"]
  total: number
  paidAt: Date | null
  voucherCode: string | null
  payments: readonly {
    status: string
    sessionId: string | null
    problem: string | null
  }[]
}): CancelView {
  if (!canCancel({ status: order.status })) return { kind: "none" }
  const c = FULFILLMENT_COPY.cancelOrder
  if (order.payments.some((payment) => payment.problem !== null)) {
    return { kind: "blocked", text: c.needsReview }
  }
  const openSession = order.payments.some(
    (payment) => payment.status === "PENDING" && payment.sessionId !== null
  )
  return {
    kind: "available",
    effects: [
      c.becomesCancelled,
      c.stockBack,
      ...(order.voucherCode ? [c.voucherBack(order.voucherCode)] : []),
      c.emailed,
      nothingReceived(order) ? c.notCharged : c.paid(formatPeso(order.total)),
      ...(openSession ? [c.sessionClosed] : []),
    ],
  }
}

export type CancelAnswer =
  | {
      ok: true
      data:
        | { kind: "done"; refundRequired: boolean }
        | {
            kind:
              | "stale"
              | "not-allowed"
              | "not-found"
              | "needs-review"
              | "paid-meanwhile"
              | "gateway-failed"
          }
    }
  | { ok: false; message: string }

export function cancelOutcomeOf(answer: CancelAnswer): Outcome {
  const c = FULFILLMENT_COPY.cancelOrder
  if (!answer.ok) return { kind: "error", text: answer.message, stale: false }
  switch (answer.data.kind) {
    case "done":
      return {
        kind: "success",
        text: answer.data.refundRequired
          ? `${c.success} ${c.successPaid}`
          : c.success,
      }
    case "stale":
      return { kind: "error", text: FULFILLMENT_COPY.stale, stale: true }
    case "paid-meanwhile":
      return { kind: "error", text: c.paidMeanwhile, stale: true }
    case "needs-review":
      return { kind: "error", text: c.needsReview, stale: false }
    case "gateway-failed":
      return { kind: "error", text: c.gatewayFailed, stale: false }
    case "not-allowed":
      return { kind: "error", text: FULFILLMENT_COPY.notAllowed, stale: false }
    case "not-found":
      return { kind: "error", text: FULFILLMENT_COPY.notFound, stale: false }
  }
}
