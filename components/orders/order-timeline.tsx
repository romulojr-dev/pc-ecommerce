import { CheckIcon } from "lucide-react"

import { ORDER_COPY } from "@/lib/orders/copy"
import type { OrderTimeline as Timeline } from "@/lib/orders/timeline"
import { cn } from "@/lib/utils"

// The order's status timeline (FR-20; docs/specs/030-place-an-order, Behavior
// 18): an ordered list in a labelled navigation. The current step carries
// aria-current="step"; Cancelled and Refunded are their own item after the
// list, and the current one then.
export function OrderTimeline({ timeline }: { timeline: Timeline }) {
  return (
    <nav aria-label={ORDER_COPY.statusHeading}>
      <ol className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        {timeline.steps.map((step) => (
          <li
            key={step.status}
            aria-current={step.state === "current" ? "step" : undefined}
            className={cn(
              "flex items-center gap-2",
              step.state === "upcoming" && "text-muted-foreground",
              step.state === "current" && "font-semibold"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-5 items-center justify-center rounded-full border text-xs",
                step.state === "done" &&
                  "border-primary bg-primary text-primary-foreground",
                step.state === "current" && "border-primary"
              )}
            >
              {step.state === "done" ? (
                <CheckIcon className="size-3" />
              ) : step.state === "current" ? (
                <span className="size-2 rounded-full bg-primary" />
              ) : null}
            </span>
            {step.label}
            {step.state === "done" && <span className="sr-only"> (done)</span>}
          </li>
        ))}
        {timeline.branch && (
          <li
            aria-current="step"
            className="flex items-center gap-2 font-semibold text-destructive"
          >
            {timeline.branch.label}
          </li>
        )}
      </ol>
    </nav>
  )
}
