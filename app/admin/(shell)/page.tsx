import { redirect } from "next/navigation"
import { connection } from "next/server"

import { adminHomeFor } from "@/lib/admin/dashboard-view"
import { requireAdminSession } from "@/lib/admin/session"

// /admin itself has nothing to show: each role goes to its first page, the
// dashboard for Owner and Demo, the orders for Staff (docs/specs/048-admin-
// dashboard, B2, R13)
export default async function AdminIndexPage() {
  await connection()
  const session = await requireAdminSession()
  redirect(adminHomeFor(session.user.adminRole))
}
