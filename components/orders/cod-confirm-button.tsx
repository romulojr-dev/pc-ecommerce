"use client"

import { useState, useTransition } from "react"

import { confirmCodOrderAction } from "@/app/(store)/orders/[number]/actions"
import { Button } from "@/components/ui/button"
import { COD_ORDER_COPY } from "@/lib/orders/copy"

type Outcome = "confirmed" | "already" | "expired" | null

// Confirm order (docs/specs/038-cash-on-delivery, Behavior 17–18): the one
// thing on the confirmation page that writes. It posts the order number and
// the link's own three values; the server checks the signature again. The
// answer replaces the button: confirmed (just now, or already), or cancelled
// because the deadline passed. A failed request keeps the button and says so.
export function CodConfirmButton({
  orderNumber,
  link,
}: {
  orderNumber: string
  link: { sig: string; exp: string; p: string }
}) {
  const [pending, start] = useTransition()
  const [outcome, setOutcome] = useState<Outcome>(null)
  const [failed, setFailed] = useState(false)

  function confirm() {
    setFailed(false)
    start(async () => {
      try {
        const result = await confirmCodOrderAction({ orderNumber, ...link })
        if (result.ok) setOutcome(result.outcome)
        else if (result.reason === "expired") setOutcome("expired")
        else setFailed(true)
      } catch {
        setFailed(true)
      }
    })
  }

  if (outcome) {
    return (
      <p aria-live="polite" className="text-sm font-medium">
        {outcome === "confirmed"
          ? COD_ORDER_COPY.confirmedNow
          : outcome === "already"
            ? COD_ORDER_COPY.alreadyConfirmed
            : COD_ORDER_COPY.cancelledNotConfirmed}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        size="lg"
        className="h-10 w-fit px-6 text-sm"
        disabled={pending}
        aria-busy={pending}
        onClick={confirm}
      >
        {pending ? COD_ORDER_COPY.confirming : COD_ORDER_COPY.confirm}
      </Button>
      <p aria-live="polite" className="min-h-5 text-sm text-destructive">
        {failed ? COD_ORDER_COPY.confirmFailed : ""}
      </p>
    </div>
  )
}
