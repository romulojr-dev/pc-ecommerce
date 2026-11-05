import { getSessionCookie } from "better-auth/cookies"

// Whether a request carries Better Auth's session cookie, under either of its
// names: "better-auth.session_token" on http://localhost and
// "__Secure-better-auth.session_token" on https. Only the cookie's presence
// is checked; the proxy is not a security boundary (docs/specs/039-staff-
// sign-in-admin-shell, Rule 14). Shared with proxy.ts so the name it looks
// for is the one lib/auth/auth.ts sets.
export function hasSessionCookie(request: Request): boolean {
  return Boolean(getSessionCookie(request))
}
