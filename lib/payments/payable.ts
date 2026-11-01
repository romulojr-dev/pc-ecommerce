import type { OrderStatusName } from "@/lib/orders/timeline"

// When an order can still be paid (docs/specs/031-pay-with-xendit, Behavior
// 4–5, D13). Instants are compared, never formatted text. Pure.

// Xendit's shortest allowed session ("at least 10 minutes in the future",
// spec 031 §6): under this much time left no session is opened
export const MIN_SESSION_MINUTES = 10
const MIN_SESSION_MS = MIN_SESSION_MINUTES * 60_000

// Whether a new session fits before the order expires: at least 10 minutes
// left, the boundary included (S6, S7, V5a)
export const canStartSession = (expiresAt: Date, now: Date): boolean =>
  expiresAt.getTime() - now.getTime() >= MIN_SESSION_MS

export const isPayable = (
  status: OrderStatusName,
  expiresAt: Date,
  now: Date
): boolean => status === "PENDING_PAYMENT" && canStartSession(expiresAt, now)
