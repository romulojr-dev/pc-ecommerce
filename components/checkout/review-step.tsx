"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import {
  placeOrderAction,
  type ReviewActionResult,
  reviewCheckoutAction,
} from "@/app/(store)/checkout/actions"
import { PROBLEMS_HEADING_ID } from "@/components/checkout/problems-box"
import {
  DETAILS_HREF,
  type ReviewOk,
  ReviewView,
} from "@/components/checkout/review-view"
import { Button, buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { STEP_COPY } from "@/lib/checkout/copy"
import { type CheckoutDraft, draftPayload } from "@/lib/checkout/draft"
import { cn, focusRing } from "@/lib/utils"

type Phase =
  | { kind: "loading" }
  | { kind: "error" }
  // `source` is what asked: the step opening, or the Check again button
  | { kind: "ready"; result: ReviewOk; source: "arrival" | "again" }

type Props = {
  draft: CheckoutDraft
  // The server refused the details: step 1 shows what to choose again
  onInvalid: (fields: Record<string, string>) => void
  // The cart is gone
  onEmpty: () => void
  // The order exists: the flow clears the saved details, zeroes the header
  // count and goes to the order's link
  onPlaced: (link: string) => void
}

// Step 2 (docs/specs/029-checkout-steps, Behavior 15–23): sends the saved
// details to the server every time it shows, and shows what comes back. The
// review action only reads (D1). Place order (docs/specs/030-place-an-order,
// Behavior 3–5) sends them again with the digest, key and token this review
// handed out.
export function ReviewStep({ draft, onInvalid, onEmpty, onPlaced }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" })
  // Check again keeps the review on screen (and focus on its button) while
  // the new answer is on its way
  const [checking, setChecking] = useState(false)
  // Place order is in flight, or has succeeded and the page is on its way to
  // the order. Either way a second click does nothing.
  const [placing, setPlacing] = useState(false)
  // What the last Place order answered, when the shopper should read it
  const [notice, setNotice] = useState<string | null>(null)
  // Only the latest request may answer
  const latest = useRef(0)

  // Sends the details and shows the answer; the caller has already put the
  // step in its loading state
  async function request(source: "arrival" | "again") {
    const mine = ++latest.current
    let result: ReviewActionResult | null = null
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

  // Reloads the review under the notice, keeping the old one on screen until
  // the new one arrives
  function reload() {
    setChecking(true)
    void request("arrival")
  }

  // Place order: sends exactly what this review handed out. After a refusal
  // that left the order unplaced the same pair is sent again on a retry; after
  // `changed` the review reloads and brings a new pair.
  async function place() {
    if (phase.kind !== "ready" || placing || checking) return
    const { digest, idempotencyKey, accessToken } = phase.result
    setPlacing(true)
    setNotice(null)
    let answer: Awaited<ReturnType<typeof placeOrderAction>> | null = null
    try {
      answer = await placeOrderAction({
        details: draftPayload(draft),
        digest,
        idempotencyKey,
        accessToken,
      })
    } catch {
      // No answer: it may have gone through. A retry with the same key and
      // token returns the order if it did.
    }
    if (!answer) {
      setNotice(STEP_COPY.placeNetwork)
      setPlacing(false)
    } else if (answer.ok) {
      // Stay busy: the page is leaving for the order
      onPlaced(answer.link)
    } else if (answer.reason === "invalid") {
      setPlacing(false)
      onInvalid(answer.fields)
    } else if (answer.reason === "empty") {
      onEmpty()
    } else if (answer.reason === "changed") {
      setNotice(STEP_COPY.placeChanged)
      setPlacing(false)
      reload()
    } else if (answer.reason === "disabled") {
      setPlacing(false)
      reload()
    } else if (answer.reason === "duplicate") {
      setNotice(STEP_COPY.placeDuplicate)
      setPlacing(false)
    } else {
      setNotice(STEP_COPY.placeError)
      setPlacing(false)
    }
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
  const live = placing
    ? STEP_COPY.placing
    : phase.kind === "loading" || checking
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
      {notice && (
        <p
          aria-live="polite"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm dark:bg-amber-500/15"
        >
          {notice}
        </p>
      )}
      {phase.kind === "loading" && <ReviewSkeleton />}
      {phase.kind === "error" && (
        <div>
          <Button type="button" onClick={() => run("arrival")}>
            {STEP_COPY.tryAgain}
          </Button>
        </div>
      )}
      {phase.kind === "ready" && (
        <ReviewView
          result={phase.result}
          placing={placing}
          onPlace={() => void place()}
          onCheckAgain={() => run("again")}
        />
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
