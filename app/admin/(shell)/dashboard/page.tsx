import type { Metadata } from "next"
import { connection } from "next/server"

import { DashboardFigures } from "@/components/admin/dashboard-figures"
import { DashboardRecent } from "@/components/admin/dashboard-recent"
import { DashboardRestock } from "@/components/admin/dashboard-restock"
import { DashboardReview } from "@/components/admin/dashboard-review"
import { NoAccess } from "@/components/admin/no-access"
import { ADMIN_COPY } from "@/lib/admin/copy"
import { DASHBOARD_COPY } from "@/lib/admin/dashboard-copy"
import { getDashboard } from "@/lib/admin/queries/dashboard"
import { requireAdminAccess } from "@/lib/admin/session"

export const metadata: Metadata = {
  title: { absolute: ADMIN_COPY.titles.dashboard },
}

// The dashboard (docs/specs/048-admin-dashboard). Per request and never
// cached: the recent orders differ by role. Data comes only from the query
// layer, which masks Demo's customer names.
export default async function AdminDashboardPage() {
  await connection()
  const { session, allowed } = await requireAdminAccess("dashboard.view")
  if (!allowed) return <NoAccess />

  const data = await getDashboard(session.user.adminRole, new Date())

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{DASHBOARD_COPY.heading}</h1>
        <p className="text-sm text-muted-foreground">{DASHBOARD_COPY.intro}</p>
        {session.user.adminRole === "demo" ? (
          <p className="text-sm text-muted-foreground">
            {DASHBOARD_COPY.demoNote}
          </p>
        ) : null}
      </div>
      <DashboardFigures
        id="dashboard-today"
        heading={DASHBOARD_COPY.windows.today}
        figures={data.sales.today}
      />
      <DashboardFigures
        id="dashboard-last30"
        heading={DASHBOARD_COPY.windows.last30}
        figures={data.sales.last30}
      />
      <p className="text-sm text-muted-foreground">
        {DASHBOARD_COPY.refundNote}
      </p>
      <DashboardReview count={data.needsReview} />
      <DashboardRestock restock={data.restock} />
      <DashboardRecent rows={data.recent} />
    </div>
  )
}
