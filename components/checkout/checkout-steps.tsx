import { STEP_COPY } from "@/lib/checkout/copy"
import { cn } from "@/lib/utils"

export type CheckoutStep = "details" | "review"

// The step indicator (docs/specs/029-checkout-steps, Behavior 6, 35): an
// ordered list in a labelled navigation. Exactly one item is the current
// step; step 3 is shown but never reached in this story. The items are not
// links, so they add no tab stops.
export function CheckoutSteps({ current }: { current: CheckoutStep }) {
  const index = current === "details" ? 0 : 1
  return (
    <nav aria-label={STEP_COPY.stepsLabel}>
      <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {STEP_COPY.steps.map((label, i) => (
          <li
            key={label}
            aria-current={i === index ? "step" : undefined}
            className={cn(
              "flex items-center gap-2",
              i === index ? "font-medium" : "text-muted-foreground"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-xs tabular-nums",
                i === index &&
                  "border-primary bg-primary text-primary-foreground"
              )}
            >
              {i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>
    </nav>
  )
}
