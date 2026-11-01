// How often the return page asks for the order's status (docs/specs/031-pay-
// with-xendit, Behavior 7, T1). Pure.

// Every 3 s for the first minute, then the "Still confirming" text
export const FAST_POLL_MS = 3_000
export const FAST_UNTIL_MS = 60_000
// Then every 15 s until 10 minutes after the page loaded
export const SLOW_POLL_MS = 15_000
export const POLL_UNTIL_MS = 600_000

// The wait before the next poll, given the time since the page loaded, or
// null when polling is over (a reload checks again)
export function pollDelay(elapsedMs: number): number | null {
  const delay = elapsedMs < FAST_UNTIL_MS ? FAST_POLL_MS : SLOW_POLL_MS
  return elapsedMs + delay <= POLL_UNTIL_MS ? delay : null
}

// Whether the page has waited long enough to say "Still confirming"
export const isSlow = (elapsedMs: number): boolean => elapsedMs >= FAST_UNTIL_MS
