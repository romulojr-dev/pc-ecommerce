import { MIN_PASSWORD_LENGTH } from "./env-schema"

// The password rule for staff and the demo account (docs/specs/039-staff-
// sign-in-admin-shell, Rule 8, D6). Better Auth's own minimum is set to the
// same number. Pure.

export const MAX_PASSWORD_LENGTH = 128

export const PASSWORD_TOO_SHORT = `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`
export const PASSWORD_TOO_LONG = `The password must be at most ${MAX_PASSWORD_LENGTH} characters.`

// null when the password is acceptable, otherwise the message to print.
// Never includes the password.
export function passwordIssue(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return PASSWORD_TOO_SHORT
  if (password.length > MAX_PASSWORD_LENGTH) return PASSWORD_TOO_LONG
  return null
}
