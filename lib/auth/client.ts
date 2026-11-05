import { createAuthClient } from "better-auth/react"

// The browser's side of staff sign-in (docs/specs/039-staff-sign-in-admin-
// shell, D4): the form signs in through the HTTP endpoint, never a server
// action, because only the HTTP route runs Better Auth's rate limiter. Only
// signIn and signOut exist on the server (lib/auth/route-guard.ts).
export const authClient = createAuthClient()
