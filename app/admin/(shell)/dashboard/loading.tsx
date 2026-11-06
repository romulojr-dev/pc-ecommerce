import { Skeleton } from "@/components/ui/skeleton"
import { DASHBOARD_COPY } from "@/lib/admin/dashboard-copy"

// Shown while the dashboard loads (docs/specs/048-admin-dashboard, B9)
export default function AdminDashboardLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <h1 className="text-2xl font-semibold">{DASHBOARD_COPY.heading}</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
