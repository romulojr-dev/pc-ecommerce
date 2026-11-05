import { auth } from "@/lib/auth/auth"
import { isAllowedAuthRequest } from "@/lib/auth/route-guard"

// Staff sign-in, sign-out and get-session, and nothing else
// (docs/specs/039-staff-sign-in-admin-shell, Rule 4). The allowlist runs
// before Better Auth, because its `disabledPaths` can't switch off the
// endpoints with a path parameter. Cache-Control and Referrer-Policy come
// from next.config.ts.
export const runtime = "nodejs"

async function handle(request: Request) {
  const { pathname } = new URL(request.url)
  if (!isAllowedAuthRequest(request.method, pathname)) {
    return new Response("Not Found", { status: 404 })
  }
  return auth.handler(request)
}

export const GET = handle
export const POST = handle
