"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { reviewCheckoutAction } from "@/app/(store)/checkout/actions"
import { DETAILS_HREF, ReviewView } from "@/components/checkout/review-view"
import { PROBLEMS_HEADING_ID } from "@/components/checkout/problems-box"
import { Button, buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { STEP_COPY } from "@/lib/checkout/copy"
import { type CheckoutDraft, draftPayload } from "@/lib/checkout/draft"
import type { ReviewResult } from "@/lib/checkout/review-checkout"
import { cn, focusRing } from "@/lib/utils"

type Ok = Extract<ReviewResult, { ok: true }>

type Phase =
  | { kind: "loading" }
  | { kind: "error" }
  // `source` is what asked: the step opening, or the Check again button
  | { kind: "ready"; result: Ok; source: "arrival" | "again" }

type Props = {
  draft: CheckoutDraft
  // The server refused the details: step 1 shows what to choose again
  onInvalid: (fields: Record<string, string>) => void
  // The cart is gone
  onEmpty: () => void
}

// Step 2 (docs/specs/029-checkout-steps, Behavior 15–23): sends the saved
// details to the server every time it shows, and shows what comes back. The
// server action only reads (D1).
export function ReviewStep({ draft, onInvalid, onEmpty }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" })
  // Check again keeps the review on screen (and focus on its button) while
  // the new answer is on its way
  const [checking, setChecking] = useState(false)
  // Only the latest request may answer
  const latest = useRef(0)

  // Sends the details and shows the answer; the caller has already put the
  // step in its loading state
  async function request(source: "arrival" | "again") {
    const mine = ++latest.current
    let result: ReviewResult | null = null
    try {
      result = await reviewCheckoutAction(draftPayload(draft))
    } catch {
      // A network failure: the same "Try again" as a server error
    }
    if (mine !== latest.current) return
    setChecking(false)
    if (!result || (!result.ok && result.reason === "error")) {
      setPhase({ kind: "error" })
    } else if (result.ok) {
      setPhase({ kind: "ready", result, source })
    } else if (result.reason === "invalid") {
      onInvalid(result.fields)
    } else {
      onEmpty()
    }
  }

  // Check again and Try again
  function run(source: "arrival" | "again") {
    if (source === "again" && phase.kind === "ready") {
      if (checking) return
      setChecking(true)
    } else {
      setPhase({ kind: "loading" })
    }
    void request(source)
  }

  useEffect(() => {
    // Once, when the step opens; the details can't change while it shows
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the answer arrives after an await; the step opens already in its loading state
    void request("arrival")
    const requests = latest
    return () => {
      // Leaving the step drops a request that is still running
      requests.current = -1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [])

  // On a blocked review focus goes to the problem summary, so it is the
  // first thing read (Behavior 33)
  useEffect(() => {
    if (phase.kind === "ready" && phase.result.review.problems.length > 0) {
      document.getElementById(PROBLEMS_HEADING_ID)?.focus()
    }
  }, [phase])

  const clean =
    phase.kind === "ready" && phase.result.review.problems.length === 0
  // One polite live region (Behavior 34), not role="status"
  const live =
    phase.kind === "loading" || checking
      ? STEP_COPY.loading
      : phase.kind === "error"
        ? STEP_COPY.loadFailed
        : clean && phase.source === "again"
          ? STEP_COPY.checkedClean
          : ""

  return (
    <div className="flex flex-col gap-4" aria-busy={phase.kind === "loading"}>
      <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
        {live}
      </p>
      {phase.kind === "loading" && <ReviewSkeleton />}
      {phase.kind === "error" && (
        <div>
          <Button type="button" onClick={() => run("arrival")}>
            {STEP_COPY.tryAgain}
          </Button>
        </div>
      )}
      {phase.kind === "ready" && (
        <ReviewView result={phase.result} onCheckAgain={() => run("again")} />
      )}
      <div>
        <Link
          href={DETAILS_HREF}
          className={cn(
            buttonVariants({ variant: "link", size: "sm" }),
            focusRing
          )}
        >
          Back to details
        </Link>
      </div>
    </div>
  )
}

// The review's reserved size while it loads
function ReviewSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]" aria-hidden="true">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <Skeleton className="h-56 w-full" />
    </div>
  )
}
