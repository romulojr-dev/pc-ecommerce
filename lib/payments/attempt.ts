import { XENDIT_TIMEOUT_MS } from "./xendit"

// A payment attempt's state for startPayment (docs/specs/034-start-payment-
// outside-transaction, behavior 1.2, D4). An OPENING attempt is fresh while
// its start may still be running, and abandoned once it is old enough that
// no live start can still be: then the next start takes it over. Age is
// measured on the database clock, so app servers with different clocks
// agree. Pure.

export type AttemptStatus =
  "OPENING" | "PENDING" | "PAID" | "EXPIRED" | "FAILED"

export type AttemptState =
  "opening" | "abandoned" | "pending" | "paid" | "expired" | "failed"

export const OPENING_ABANDONED_AFTER_MS = 60_000

// The claim's and the attach's transactions: database work only
export const START_TRANSACTION = { maxWait: 5_000, timeout: 5_000 } as const

// The longest a live start can take from its claim to its attach: waiting for
// the claim's transaction, the close, the read after a "not active" answer,
// the create, and waiting for the attach's transaction
export const START_PATH_BUDGET_MS =
  START_TRANSACTION.maxWait + 3 * XENDIT_TIMEOUT_MS + START_TRANSACTION.maxWait

const STATES = {
  PENDING: "pending",
  PAID: "paid",
  EXPIRED: "expired",
  FAILED: "failed",
} as const

// `dbNow` is the database's now(), read with the order's lock. A createdAt
// after it is fresh: an attempt is never abandoned early (U3).
export function attemptState(
  attempt: { status: AttemptStatus; createdAt: Date },
  dbNow: Date
): AttemptState {
  if (attempt.status !== "OPENING") return STATES[attempt.status]
  return dbNow.getTime() - attempt.createdAt.getTime() >=
    OPENING_ABANDONED_AFTER_MS
    ? "abandoned"
    : "opening"
}
