"use client"

import { CircleXIcon, TriangleAlertIcon } from "lucide-react"
import { useMemo } from "react"

import { FitLabel, isShown } from "@/components/fit/fit-badge"
import { useFits } from "@/hooks/use-fits"
import type { Fit, FitPart } from "@/lib/build-state/fit"

// The product page's "Fits your build" block
// (docs/specs/023-fits-your-build-hints, Behavior 10–12): the label, and for
// a part that doesn't fit or fits with warnings, the issue messages, errors
// first, each marked Error or Warning. It goes at the end of the buy column,
// so a long list never pushes the price, stock or buttons. The label's line
// is there from the server render on, and the block is not a live region.
export function FitWithBuild({ part }: { part: FitPart }) {
  const parts = useMemo(() => [part], [part])
  return <FitBlock fit={useFits(parts)?.[0] ?? null} />
}

// The block's markup for one state; null before the build has loaded
export function FitBlock({ fit }: { fit: Fit | null }) {
  return (
    <section
      aria-label="Fit with your build"
      className="flex flex-col gap-2 text-sm"
    >
      <div className="min-h-5 leading-5">
        {isShown(fit) && <FitLabel fit={fit} />}
      </div>
      {fit && "issues" in fit && (
        <ul className="flex flex-col gap-1.5">
          {fit.issues.map((issue) => {
            const Icon =
              issue.severity === "error" ? CircleXIcon : TriangleAlertIcon
            return (
              <li key={issue.rule} className="flex gap-1.5">
                <Icon
                  aria-hidden="true"
                  className={
                    issue.severity === "error"
                      ? "mt-0.5 size-4 shrink-0 text-destructive"
                      : "mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400"
                  }
                />
                <span>
                  <span className="font-medium">
                    {issue.severity === "error" ? "Error" : "Warning"}:
                  </span>{" "}
                  {issue.message}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
