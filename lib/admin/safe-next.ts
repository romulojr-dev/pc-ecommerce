// Where to go after signing in (docs/specs/039-staff-sign-in-admin-shell,
// Rule 17, R-7). The `next` query value comes from the URL, so it is trusted
// only when it is an in-site /admin path; anything else becomes the default.
// Pure.

// "/admin" itself sends each role to its own first page (adminHomeFor, docs/
// specs/048-admin-dashboard, R13); the sign-in form knows no role yet
export const ADMIN_HOME = "/admin"
const LOGIN = "/admin/login"

export function safeNext(value: string | null | undefined): string {
  if (!value) return ADMIN_HOME

  // The value is decoded once, then judged as text
  let path: string
  try {
    path = decodeURIComponent(value)
  } catch {
    return ADMIN_HOME
  }

  // Control characters, backslashes and anything with a scheme or a second
  // leading slash can leave the site
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return ADMIN_HOME
  if (!path.startsWith("/") || path.startsWith("//")) return ADMIN_HOME

  // Only /admin itself or something below it ("/administrator" is not)
  if (!/^\/admin(?:[/?#]|$)/.test(path)) return ADMIN_HOME

  // No dot segments: "/admin/../checkout" is not an admin page
  const pathOnly = path.split(/[?#]/)[0]!
  if (
    pathOnly.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return ADMIN_HOME
  }

  // Back to the form would loop, and the bare /admin is a redirect
  if (pathOnly === LOGIN || pathOnly === `${LOGIN}/`) return ADMIN_HOME
  if (pathOnly === "/admin" || pathOnly === "/admin/") return ADMIN_HOME

  return path
}
