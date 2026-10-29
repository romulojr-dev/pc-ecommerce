import {
  CircleCheckIcon,
  CircleXIcon,
  type LucideIcon,
  PackageCheckIcon,
  TriangleAlertIcon,
} from "lucide-react"

import type { Fit } from "@/lib/build-state/fit"
import { cn } from "@/lib/utils"

// The "Fits your build" hint (docs/specs/023-fits-your-build-hints). The
// state is text plus an icon, never color alone.

type Shown = Exclude<Fit, { kind: "none" }>

const COPY: Record<Shown["kind"], string> = {
  "in-build": "In your build",
  fits: "Fits your build",
  warnings: "Fits, with warnings",
  errors: "Doesn't fit your build",
}

const ICON: Record<Shown["kind"], LucideIcon> = {
  "in-build": PackageCheckIcon,
  fits: CircleCheckIcon,
  warnings: TriangleAlertIcon,
  errors: CircleXIcon,
}

const TONE: Record<Shown["kind"], string> = {
  "in-build": "text-foreground",
  fits: "text-emerald-700 dark:text-emerald-400",
  warnings: "text-amber-700 dark:text-amber-400",
  errors: "text-destructive",
}

// The label with its icon
export function FitLabel({ fit }: { fit: Shown }) {
  const Icon = ICON[fit.kind]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium",
        TONE[fit.kind]
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {COPY[fit.kind]}
    </span>
  )
}

export const isShown = (fit: Fit | null): fit is Shown =>
  fit !== null && fit.kind !== "none"

// A card's hint, in its extra slot (Behavior 7–9). The one-line box is there
// from the server render on, whether or not a hint ever shows, so a hint
// appearing after the build loads moves nothing. The reasons are visually
// hidden text in the card's reading order, errors first.
export function FitBadge({ fit }: { fit: Fit | null }) {
  return (
    <div className="min-h-4 text-xs leading-4">
      {isShown(fit) && (
        <>
          <FitLabel fit={fit} />
          {"issues" in fit && (
            <ul className="sr-only">
              {fit.issues.map((issue) => (
                <li key={issue.rule}>
                  {issue.severity === "error" ? "Error" : "Warning"}:{" "}
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
