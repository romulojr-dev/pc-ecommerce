import { cn } from "@/lib/utils"
import { ADMIN_COPY } from "@/lib/admin/copy"
import { type OrderStatusName, statusLabel } from "@/lib/orders/timeline"

// The status, "Due for release" and the two flags as text badges, never colour
// alone (docs/specs/041-admin-orders-list-detail, B3, B4, R17). Shared by the
// list and the detail.

const base =
  "inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap"

export function StatusBadge({ status }: { status: OrderStatusName }) {
  return <span className={cn(base, "bg-muted")}>{statusLabel(status)}</span>
}

export function OrderBadges({
  status,
  dueForRelease,
  refundRequired,
  needsCheck,
  showStatus = true,
}: {
  status: OrderStatusName
  dueForRelease: boolean
  refundRequired: boolean
  needsCheck: boolean
  showStatus?: boolean
}) {
  const { badges } = ADMIN_COPY.orders
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {showStatus ? <StatusBadge status={status} /> : null}
      {dueForRelease ? (
        <span className={cn(base, "border-amber-600/40 text-amber-700")}>
          {badges.due}
        </span>
      ) : null}
      {refundRequired ? (
        <span className={cn(base, "border-destructive/40 text-destructive")}>
          {badges.refund}
        </span>
      ) : null}
      {needsCheck ? (
        <span className={cn(base, "border-destructive/40 text-destructive")}>
          {badges.check}
        </span>
      ) : null}
    </span>
  )
}
