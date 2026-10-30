import {
  CalendarClockIcon,
  TriangleAlertIcon,
  XCircleIcon,
  type LucideIcon,
} from "lucide-react"

import { flagText } from "@/lib/cart/copy"
import type { ProductFlag } from "@/lib/cart/flags"
import { cn } from "@/lib/utils"

const flagIcon: Record<ProductFlag["kind"], LucideIcon> = {
  retired: XCircleIcon,
  "out-of-stock": XCircleIcon,
  "pre-order": CalendarClockIcon,
  "over-stock": TriangleAlertIcon,
}

// A cart line's flag (docs/specs/027-cart-stock-flags, Behavior 5, 10): the
// reason as text with an icon, never colour alone. The three unavailable
// labels look the same (one severity, D1); "Only N in stock" is a warning.
// No client hooks.
export function FlagLine({
  flag,
  className,
}: {
  flag: ProductFlag
  className?: string
}) {
  const Icon = flagIcon[flag.kind]
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-sm font-medium",
        flag.kind === "over-stock"
          ? "text-amber-700 dark:text-amber-400"
          : "text-destructive",
        className
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {flagText(flag)}
    </p>
  )
}
