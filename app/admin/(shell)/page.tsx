import { redirect } from "next/navigation"
import { connection } from "next/server"

import { ADMIN_HOME } from "@/lib/admin/safe-next"
import { requireAdminSession } from "@/lib/admin/session"

// /admin itself has nothing to show: staff land on the orders
export default async function AdminIndexPage() {
  await connection()
  await requireAdminSession()
  redirect(ADMIN_HOME)
}
