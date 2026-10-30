import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  type LucideIcon,
  XCircleIcon,
} from "lucide-react"

import { formatDate } from "@/lib/format"
import { type StockStatus, stockStatusLabel } from "@/lib/stock"
import { cn } from "@/lib/utils"

const statusIcon: Record<StockStatus, LucideIcon> = {
  "in-stock": CheckCircle2Icon,
  "low-stock": AlertTriangleIcon,
  "out-of-stock": XCircleIcon,
  "pre-order": CalendarClockIcon,
}

// The stock status as text with an icon, never color alone. Shared by the
// product page (docs/specs/010-product-page) and the cart's lines
// (docs/specs/025-cart-single-items). No client hooks.
export function StockLine({
  status,
  preorderShipsOn,
  className,
}: {
  status: StockStatus
  // "YYYY-MM-DD" while on pre-order
  preorderShipsOn: string | null
  className?: string
}) {
  const Icon = statusIcon[status]
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-sm font-medium",
        status === "out-of-stock" && "text-destructive",
        className
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {status === "pre-order" && preorderShipsOn
        ? `Pre-order: ships ${formatDate(preorderShipsOn)}`
        : stockStatusLabel[status]}
    </p>
  )
}
