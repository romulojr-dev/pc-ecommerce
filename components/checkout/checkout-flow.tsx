"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import {
  type CheckoutStep,
  CheckoutSteps,
} from "@/components/checkout/checkout-steps"
import { ContactDeliveryStep } from "@/components/checkout/contact-delivery-step"
import { ReviewStep } from "@/components/checkout/review-step"
import { TestModeBanner } from "@/components/checkout/test-mode-banner"
import { Skeleton } from "@/components/ui/skeleton"
import { useCheckoutDraft } from "@/hooks/use-checkout-draft"
import { STEP_COPY } from "@/lib/checkout/copy"
import { clearFrom, isComplete } from "@/lib/checkout/draft"
import type { ReviewProblem } from "@/lib/checkout/problems"

export const STEP_HEADING_ID = "checkout-heading"

type Props = {
  pickupEnabled: boolean
  store: { address: string; hours: string }
  // The cart's problems that need no address, from the server render
  problems: readonly ReviewProblem[]
  summary: { count: number; subtotal: number }
}

// The checkout's steps (docs/specs/029-checkout-steps, Behavior 6–8, 15,
// 33–35). The step is in the URL (`?step=review`); the details are in this
// tab's sessionStorage, which only the browser can read, so the server render
// is the same shell for both steps and the browser picks the step after
// mounting.
export function CheckoutFlow({
  pickupEnabled,
  store,
  problems,
  summary,
}: Props) {
  const router = useRouter()
  const urlStep: CheckoutStep =
    useSearchParams().get("step") === "review" ? "review" : "details"
  const hydrated = useCheckoutDraft((state) => state.hydrated)
  const draft = useCheckoutDraft((state) => state.draft)
  const replace = useCheckoutDraft((state) => state.replace)
  // Errors the form shows: its own, or the server's after a review
  const [errors, setErrors] = useState<Record<string, string>>({})

  const method = pickupEnabled ? draft.method : "delivery"
  const complete = hydrated && isComplete({ ...draft, method })
  // Step 2 needs saved, valid details: a new tab or a bookmark goes to step 1
  const step: CheckoutStep = !hydrated
    ? urlStep
    : urlStep === "review" && complete
      ? "review"
      : "details"

  useEffect(() => {
    if (hydrated && urlStep === "review" && !complete) {
      window.history.replaceState(null, "", "/checkout")
    }
  }, [hydrated, urlStep, complete])

  // A step change moves focus to the new step's heading, and step 1 reloads
  // the page's cart data first (Behavior 9, 33). The first page load moves
  // nothing.
  const previous = useRef<CheckoutStep | null>(null)
  useEffect(() => {
    if (!hydrated) return
    const before = previous.current
    previous.current = step
    if (before === null || before === step) return
    if (step === "details") router.refresh()
    document.getElementById(STEP_HEADING_ID)?.focus()
  }, [hydrated, step, router])

  function showErrorsFrom(fields: Record<string, string>) {
    let next = { ...draft, method }
    for (const key of Object.keys(fields)) {
      const level = /^address\.(region|province|city|barangay)Code$/.exec(
        key
      )?.[1]
      if (level) next = clearFrom(next, `${level}Code` as never)
      if (key === "method") next = { ...next, method: "delivery" }
    }
    replace(next)
    setErrors(fields)
    window.history.replaceState(null, "", "/checkout")
  }

  return (
    <div className="flex flex-col gap-6">
      <TestModeBanner />
      <CheckoutSteps current={step} />
      <h2
        id={STEP_HEADING_ID}
        tabIndex={-1}
        className="text-2xl font-semibold tracking-tight outline-none"
      >
        {step === "details"
          ? STEP_COPY.contactHeading
          : STEP_COPY.reviewHeading}
      </h2>
      {!hydrated ? (
        <FormSkeleton />
      ) : step === "details" ? (
        <ContactDeliveryStep
          draft={{ ...draft, method }}
          onChange={replace}
          errors={errors}
          onErrors={setErrors}
          pickupEnabled={pickupEnabled}
          store={store}
          problems={problems}
          summary={summary}
          onContinue={() =>
            window.history.pushState(null, "", "/checkout?step=review")
          }
        />
      ) : (
        <ReviewStep
          draft={draft}
          onInvalid={showErrorsFrom}
          onEmpty={() => router.replace("/cart")}
        />
      )}
    </div>
  )
}

// Step 1's reserved size until the saved details are read (no layout shift)
function FormSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
