// Which requests reach Better Auth at all (docs/specs/039-staff-sign-in-admin-
// shell, Rule 4, plan task 1 finding). Better Auth's `disabledPaths` compares
// exact strings, so it can't switch off the two endpoints whose path has a
// parameter (/callback/:id, /reset-password/:token). This allowlist runs
// first: sign-in, sign-out and get-session, by exact path and method, and a
// 404 for everything else. Pure.

export const AUTH_BASE_PATH = "/api/auth"

// Better Auth's own paths (relative to the base path) and the methods the
// route accepts for them
export const ALLOWED_AUTH_ENDPOINTS: Record<string, readonly string[]> = {
  "/sign-in/email": ["POST"],
  "/sign-out": ["POST"],
  "/get-session": ["GET", "POST"],
}

export function isAllowedAuthRequest(method: string, pathname: string) {
  if (!pathname.startsWith(`${AUTH_BASE_PATH}/`)) return false
  const path = pathname.slice(AUTH_BASE_PATH.length)
  const methods = Object.hasOwn(ALLOWED_AUTH_ENDPOINTS, path)
    ? ALLOWED_AUTH_ENDPOINTS[path]
    : undefined
  return methods?.includes(method.toUpperCase()) ?? false
}
