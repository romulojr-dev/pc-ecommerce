import type { Metadata } from "next"
import { connection } from "next/server"

import { ADMIN_COPY } from "@/lib/admin/copy"
import { NoAccess } from "@/components/admin/no-access"
import { requireAdminAccess } from "@/lib/admin/session"

export const metadata: Metadata = {
  title: { absolute: ADMIN_COPY.titles.orders },
}

// A placeholder until the Admin panel's order list: it reads no order, so
// nothing here depends on the role (docs/specs/039-staff-sign-in-admin-shell,
// Rule 18, R-13)
export default async function AdminOrdersPage() {
  await connection()
  const access = await requireAdminAccess("orders.view")
  if (!access.allowed) return <NoAccess />
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{ADMIN_COPY.orders.heading}</h1>
      <p className="text-muted-foreground">{ADMIN_COPY.orders.body}</p>
    </div>
  )
}
