import { notFound } from "next/navigation"
import { connection } from "next/server"

import { requireAdminSession } from "@/lib/admin/session"

// Any other /admin path: a signed-in person sees the not-found page inside
// the shell (next to this folder), a signed-out one is sent to the form
// (docs/specs/039-staff-sign-in-admin-shell, Rule 21)
export default async function AdminUnknownPage() {
  await connection()
  await requireAdminSession()
  notFound()
}
