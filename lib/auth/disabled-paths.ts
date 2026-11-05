// Every Better Auth 1.7.17 endpoint except the three the app serves
// (docs/specs/039-staff-sign-in-admin-shell, Rule 4). Listed by hand, not
// derived, so a Better Auth upgrade that adds an endpoint fails
// lib/auth/auth.db.test.ts until someone decides about it. Paths are relative
// to the base path. `disabledPaths` matches exact strings, so the two with a
// parameter are listed for the reader but only lib/auth/route-guard.ts
// blocks them.

export const ALLOWED_AUTH_PATHS = [
  "/sign-in/email",
  "/sign-out",
  "/get-session",
]

export const DISABLED_AUTH_PATHS = [
  "/sign-in/social",
  "/callback/:id",
  "/sign-up/email",
  "/reset-password",
  "/verify-password",
  "/verify-email",
  "/send-verification-email",
  "/change-email",
  "/change-password",
  "/update-session",
  "/update-user",
  "/delete-user",
  "/request-password-reset",
  "/reset-password/:token",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/link-social",
  "/list-accounts",
  "/delete-user/callback",
  "/unlink-account",
  "/refresh-token",
  "/get-access-token",
  "/account-info",
  "/ok",
  "/error",
]
