import "server-only"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

import type { UserRole } from "@/generated/prisma/client"
import { auth } from "@/lib/auth/auth"
import { db } from "@/lib/db"
import {
  type AdminAction,
  type AdminRole,
  adminRoleOf,
  can,
} from "@/lib/admin/permissions"

// The real check behind /admin (docs/specs/039-staff-sign-in-admin-shell,
// Rules 14 and 15). proxy.ts only looks for a cookie; every admin page and
// layout calls requireAdminSession() (a test fails when one doesn't), and
// #105's adminAction / adminRoute build on it.

export const ADMIN_LOGIN_PATH = "/admin/login"

export type AdminSession = {
  sessionId: string
  user: {
    id: string
    name: string
    email: string
    role: UserRole
    // The same role as the permission table knows it
    adminRole: AdminRole
  }
}

const ROLES: readonly string[] = ["OWNER", "STAFF", "DEMO"]

// The session of these request headers, or null. Not cached, so tests can
// call it with a cookie; getAdminSession() is the per-request version.
//
// A user with `disabledAt` set is refused on every call, not only at sign-in
// (a session can outlive `staff:disable` in a race), and the session is
// deleted on the spot: clearing `disabledAt` later must not bring an old
// cookie back, the person signs in again. Only that one session row goes.
export async function loadAdminSession(
  requestHeaders: Headers
): Promise<AdminSession | null> {
  const found = await auth.api.getSession({ headers: requestHeaders })
  if (!found) return null

  const user = found.user as typeof found.user & {
    role?: string
    disabledAt?: Date | string | null
  }
  if (user.disabledAt) {
    await db.session.deleteMany({ where: { id: found.session.id } })
    return null
  }
  // The role comes from the user row, never from a request; an unknown value
  // means a bad row, so nobody gets in on it
  if (!user.role || !ROLES.includes(user.role)) return null
  const adminRole = adminRoleOf(user.role)
  if (!adminRole) return null

  return {
    sessionId: found.session.id,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as UserRole,
      adminRole,
    },
  }
}

// Once per request, however many layouts and pages ask
export const getAdminSession = cache(async () =>
  loadAdminSession(await headers())
)

// For every admin page and layout: the session, or a redirect to the sign-in
// form
export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession()
  if (!session) redirect(ADMIN_LOGIN_PATH)
  return session
}

// For a page that needs a view action: the session, and whether the role may
// open the page. A page that is not allowed returns <NoAccess /> before it
// reads anything (docs/specs/040-admin-permissions-audit-masking, Behavior 3):
//
//   const access = await requireAdminAccess("products.view")
//   if (!access.allowed) return <NoAccess />
export async function requireAdminAccess(
  action: AdminAction
): Promise<{ session: AdminSession; allowed: boolean }> {
  const session = await requireAdminSession()
  return { session, allowed: can(session.user.adminRole, action) }
}
