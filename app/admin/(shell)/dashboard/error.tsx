"use client"

import { Button } from "@/components/ui/button"
import { DASHBOARD_COPY } from "@/lib/admin/dashboard-copy"

// What the dashboard shows when loading it fails (docs/specs/048-admin-
// dashboard, B9, D8): one line and a retry, never the failure's detail.
export default function AdminDashboardError({ reset }: { reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold">{DASHBOARD_COPY.heading}</h1>
      <p role="alert">{DASHBOARD_COPY.error}</p>
      <Button onClick={reset}>{DASHBOARD_COPY.retry}</Button>
    </div>
  )
}
