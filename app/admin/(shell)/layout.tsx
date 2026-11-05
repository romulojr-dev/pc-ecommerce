import type { Metadata } from "next"
import { connection } from "next/server"

import { AdminShell } from "@/components/admin/admin-shell"
import { requireAdminSession } from "@/lib/admin/session"

// Everything under /admin except the sign-in form: not indexed, per request,
// and behind the session check (docs/specs/039-staff-sign-in-admin-shell,
// Rules 15 and 16). The pages call requireAdminSession too: a layout does not
// guard what it renders.
export const metadata: Metadata = {
  title: { absolute: "PC Silicon Admin" },
  robots: { index: false, follow: false },
}

export default async function AdminShellLayout({
  children,
}: LayoutProps<"/admin">) {
  await connection()
  const { user } = await requireAdminSession()
  return <AdminShell user={user}>{children}</AdminShell>
}
