import type { ReconcileOutcome } from "@/lib/payments/outcome"

import { isPastDue } from "./time"
import type { OrderStatusName } from "./timeline"

// The pure rules of releasing unpaid orders (docs/specs/033-release-unpaid-
// orders, behavior 1–8): which orders are due, and what step 1's answers about
// their open sessions decide. No database, no gateway.

// Purchases wait at most this long for one gateway call, and start none after
// the budget (behavior 7, D5)
export const PURCHASE_GATEWAY_TIMEOUT_MS = 2_500
export const PURCHASE_BUDGET_MS = 3_000

// Orders checked per run (D13)
export const SCOPED_LIMIT = 10
export const SWEEP_LIMIT = 10
export const CRON_BATCH = 25
export const CRON_BUDGET_MS = 50_000

// Pending payment, or Pending confirmation (a cash order, docs/specs/038-cash-
// on-delivery, Behavior 20), at or past expiresAt, and no payment that needs
// checking (behavior 1). The boundary is the order page's: at the deadline it
// is due. A COD confirmed order is never due.
export const isDue = (
  order: { status: OrderStatusName; expiresAt: Date; flagged: boolean },
  now: Date
): boolean =>
  (order.status === "PENDING_PAYMENT" ||
    order.status === "PENDING_CONFIRMATION") &&
  !order.flagged &&
  isPastDue(order.expiresAt, now)

// What step 1 learned about one open session
export type SessionCheck =
  // The gateway cancelled it: nothing more can be paid on it
  | { kind: "cancelled" }
  // It had already ended, and reconciling it gave this
  | { kind: "reconciled"; outcome: ReconcileOutcome }
  // The cancel failed (a gateway failure code, e.g. "timeout")
  | { kind: "failed"; code: string }

export type ReleaseDecision =
  { release: true } | { release: false; code: string }

// Ended unpaid, or what was paid is already recorded (step 2 re-checks the
// status under the lock)
const ENDED_UNPAID: readonly ReconcileOutcome[] = ["expired", "already-applied"]

// An order is released only when every open session ended unpaid (behavior 5
// and 6). Anything else names the first reason it isn't: `paid` and
// `mismatch` change the order; the rest are skipped until the next run.
export function releaseDecision(checks: SessionCheck[]): ReleaseDecision {
  for (const check of checks) {
    if (check.kind === "failed") return { release: false, code: check.code }
    if (check.kind === "reconciled" && !ENDED_UNPAID.includes(check.outcome)) {
      return { release: false, code: check.outcome }
    }
  }
  return { release: true }
}
