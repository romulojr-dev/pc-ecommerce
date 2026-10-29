import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { SeverityMarker } from "@/components/builder/part-summary"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { SharedStatus } from "@/lib/build-state/shared"
import type { Issue, PowerEstimate } from "@/lib/builder"
import { specValue } from "@/lib/builder/format"
import { cn, focusRing } from "@/lib/utils"

// The pieces of a build's summary that the builder (docs/specs/020-builder-
// page, Behavior 15) and the shared page (docs/specs/022-share-build,
// Behavior 17) both show.

const watts = (value: number) => specValue("psu", "wattageW", value)

// The power line (docs/specs/019-count-capacity-power-rules, Messages):
// always called "Estimated"
export function powerText({ watts: w, psuWatts, loadPercent }: PowerEstimate) {
  return psuWatts === null
    ? `Estimated power: ${watts(w)}`
    : `Estimated power: ${watts(w)} of ${watts(psuWatts)} (${loadPercent}%)`
}

// Each status has its own icon, so color isn't the only signal. "Incomplete"
// is the shared page's: parts that are no longer sold were left out.
const STATUS = {
  ok: {
    label: "OK",
    Icon: CircleCheckIcon,
    className: "text-emerald-700 dark:text-emerald-400",
  },
  warnings: {
    label: "Warnings",
    Icon: TriangleAlertIcon,
    className: "text-amber-700 dark:text-amber-400",
  },
  errors: { label: "Errors", Icon: CircleXIcon, className: "text-destructive" },
  incomplete: {
    label: "Incomplete",
    Icon: CircleAlertIcon,
    className: "text-amber-700 dark:text-amber-400",
  },
} as const

export function PowerLine({ power }: { power: PowerEstimate }) {
  return (
    <p className="flex items-center gap-1.5 text-sm tabular-nums">
      {powerText(power)}
      <Tooltip>
        <TooltipTrigger
          aria-label="How is this estimated?"
          className={cn(
            "rounded-full text-muted-foreground hover:text-foreground",
            focusRing
          )}
        >
          <InfoIcon aria-hidden="true" className="size-4" />
        </TooltipTrigger>
        <TooltipContent>
          The CPU&rsquo;s and graphics card&rsquo;s maximum power draw, plus 30%
          headroom for the other parts and short power spikes.
        </TooltipContent>
      </Tooltip>
    </p>
  )
}

export function StatusLine({ status }: { status: SharedStatus }) {
  const { label, Icon, className } = STATUS[status]
  return (
    <p className="flex items-center gap-2 text-sm">
      Compatibility:
      <span
        className={cn("inline-flex items-center gap-1 font-medium", className)}
      >
        <Icon aria-hidden="true" className="size-4" />
        {label}
      </span>
    </p>
  )
}

// Every issue message, errors first (the engine's order), or the all-clear
export function IssueList({ issues }: { issues: readonly Issue[] }) {
  if (issues.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No compatibility issues found.
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-3">
      {issues.map((issue) => (
        <li key={issue.rule} className="flex flex-col gap-0.5 text-sm">
          <SeverityMarker severity={issue.severity} />
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  )
}
