import { NextResponse, type NextRequest } from "next/server"

import { hasSessionCookie } from "@/lib/auth/cookie"

// Sends a visitor with no session cookie to the admin sign-in form
// (docs/specs/039-staff-sign-in-admin-shell, Rule 14). It is only a
// convenience: it checks that the cookie exists and validates nothing, so it
// is not a security boundary. The real check is requireAdminSession() in
// every admin page and layout. No `runtime` is exported: Proxy runs on Node.js
// and throws if one is set.
//
// The matcher covers /admin and below. /api/auth is outside it, and the form
// itself is let through so a signed-out visit renders without a redirect.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    return NextResponse.next()
  }
  if (hasSessionCookie(request)) return NextResponse.next()

  const login = new URL("/admin/login", request.url)
  login.searchParams.set("next", `${pathname}${search}`)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ["/admin/:path*"],
}
