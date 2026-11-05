import { Skeleton } from "@/components/ui/skeleton"
import { ADMIN_COPY } from "@/lib/admin/copy"

// Shown while the list loads (docs/specs/042-admin-customers, B10)
export default function AdminCustomersLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <h1 className="text-2xl font-semibold">{ADMIN_COPY.customers.heading}</h1>
      <Skeleton className="h-12 w-full max-w-xl" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}
