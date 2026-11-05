import { ADMIN_COPY } from "./copy"

// What the sign-in form shows for what the browser typed and what the server
// answered (docs/specs/039-staff-sign-in-admin-shell, Rule 31). Pure.

export type LoginFieldErrors = { email?: string; password?: string }

export function validateLogin(values: {
  email: string
  password: string
}): LoginFieldErrors {
  const errors: LoginFieldErrors = {}
  if (!values.email.trim()) errors.email = ADMIN_COPY.login.emailRequired
  if (!values.password) errors.password = ADMIN_COPY.login.passwordRequired
  return errors
}

// Seconds to wait, from the response's retry delay (X-Retry-After); a missing
// or odd value falls back to the sign-in window
const DEFAULT_RETRY_SECONDS = 10
const MAX_RETRY_SECONDS = 3600

export function retrySeconds(header: string | null | undefined): number {
  const seconds = Number(header)
  if (!Number.isFinite(seconds) || seconds < 1) return DEFAULT_RETRY_SECONDS
  return Math.min(Math.ceil(seconds), MAX_RETRY_SECONDS)
}

// The one line under the form after a sign-in that didn't work. A wrong
// password, an unknown email and a disabled user all read the same (D7).
export function signInFailureText(
  status: number | undefined,
  retryAfter: string | null | undefined
): string {
  if (status === 429) {
    return ADMIN_COPY.login.rateLimited(retrySeconds(retryAfter))
  }
  if (status === 401 || status === 400) return ADMIN_COPY.login.wrongCredentials
  return ADMIN_COPY.login.failure
}
