// The sign-in rate limit (docs/specs/039-staff-sign-in-admin-shell, Rule 9)
// and the age at which the cron deletes old rows (D15). Pure.

// Better Auth's own path for email sign-in, without the /api/auth base
export const SIGN_IN_PATH = "/sign-in/email"

// 3 requests per 10 seconds per client IP, right or wrong password
export const SIGN_IN_LIMIT = { window: 10, max: 3 } as const

// Every window is shorter than this, so a row older than it can't matter
export const RATE_LIMIT_KEEP_MS = 60 * 60 * 1000

// What the daily cron deletes: sessions that expired before `sessionCutoff`,
// rate-limit rows whose last request (milliseconds) is before
// `rateLimitCutoffMs`
export function cleanupCutoffs(now: Date): {
  sessionCutoff: Date
  rateLimitCutoffMs: number
} {
  return {
    sessionCutoff: new Date(now.getTime()),
    rateLimitCutoffMs: now.getTime() - RATE_LIMIT_KEEP_MS,
  }
}
