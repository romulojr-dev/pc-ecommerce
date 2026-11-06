import { Skeleton } from "@/components/ui/skeleton"
import { AUDIT_COPY } from "@/lib/admin/audit-copy"

// Shown while the audit log loads (docs/specs/047-admin-audit-log-view, B6)
export default function AdminAuditLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <h1 className="text-2xl font-semibold">{AUDIT_COPY.heading}</h1>
      <Skeleton className="h-12 w-full max-w-3xl" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}
