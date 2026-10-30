import { TriangleAlertIcon } from "lucide-react"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { problemsHeading, problemText } from "@/lib/checkout/copy"
import type { ReviewProblem } from "@/lib/checkout/problems"
import { cn, focusRing } from "@/lib/utils"

export const PROBLEMS_HEADING_ID = "checkout-problems"

// What stops the order (docs/specs/029-checkout-steps, Behavior 9, 20): a
// labelled group whose heading takes focus on a blocked review. It is not a
// live region: focus announces it, so it isn't read twice (Behavior 34).
export function ProblemsBox({
  problems,
  changeDeliveryHref,
}: {
  problems: readonly ReviewProblem[]
  // Only the review has a delivery to change; step 1 passes nothing
  changeDeliveryHref?: string
}) {
  const noRate = problems.some((problem) => problem.kind === "no-rate")
  return (
    <section
      aria-labelledby={PROBLEMS_HEADING_ID}
      className="flex flex-col gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm dark:bg-amber-500/15"
    >
      <h3
        id={PROBLEMS_HEADING_ID}
        tabIndex={-1}
        className="flex items-center gap-2 font-medium outline-none"
      >
        <TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
        {problemsHeading(problems.length)}
      </h3>
      <ul className="flex flex-col gap-2">
        {problems.map((problem, index) => (
          <li key={index} className="flex flex-col gap-1">
            <span>{problemText(problem)}</span>
            {problem.kind === "build-errors" && (
              <ul className="ml-4 list-disc">
                {problem.issues.map((issue) => (
                  <li key={issue.rule}>{issue.message}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/cart"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            focusRing
          )}
        >
          Back to cart
        </Link>
        {noRate && changeDeliveryHref && (
          <Link
            href={changeDeliveryHref}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              focusRing
            )}
          >
            Change delivery
          </Link>
        )}
      </div>
    </section>
  )
}
