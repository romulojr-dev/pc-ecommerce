import { Skeleton } from "@/components/ui/skeleton"
import { INVENTORY_COPY } from "@/lib/admin/inventory-copy"

// Shown while the list loads (docs/specs/046-admin-inventory-adjustments, B7)
export default function AdminInventoryLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <h1 className="text-2xl font-semibold">{INVENTORY_COPY.heading}</h1>
      <Skeleton className="h-12 w-full max-w-3xl" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}
