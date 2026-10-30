import {
  CalendarClockIcon,
  TriangleAlertIcon,
  XCircleIcon,
  type LucideIcon,
} from "lucide-react"

import { flagText, groupFlagText } from "@/lib/cart/copy"
import {
  type GroupPartFlag,
  isUnavailable,
  type ProductFlag,
} from "@/lib/cart/flags"
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
  text = flagText(flag),
  className,
}: {
  flag: ProductFlag
  // Replaces the flag's own text (a group's line names the part)
  text?: string
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
      {text}
    </p>
  )
}

// A group's flag under its label, also when it is collapsed (Behavior 10):
// one part is named, several are counted. It looks like an unavailable flag
// when any part is, since that is the stronger reason.
export function GroupFlagLine({
  parts,
  className,
}: {
  parts: readonly GroupPartFlag[]
  className?: string
}) {
  const lead = parts.find(({ flag }) => isUnavailable(flag)) ?? parts[0]
  return (
    <FlagLine
      flag={lead.flag}
      text={groupFlagText(parts)}
      className={className}
    />
  )
}
