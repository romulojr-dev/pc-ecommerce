import { formatPeso } from "@/lib/format"
import {
  emailTypeFor,
  recordsCashPayment,
  type TransitionOrder,
  type TransitionTarget,
  transitionsFor,
} from "@/lib/orders/transitions"
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
