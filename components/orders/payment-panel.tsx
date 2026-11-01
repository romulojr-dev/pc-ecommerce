"use client"

import { LoaderCircleIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { startPaymentAction } from "@/app/(store)/orders/[number]/actions"
import { Button } from "@/components/ui/button"
import { useOrderStatus } from "@/hooks/use-order-status"
import { PAY_COPY, stillConfirmingText } from "@/lib/payments/copy"
import type { PaymentView } from "@/lib/payments/payment-view"

// The order page's payment area while it is Pending payment (docs/specs/031-
// pay-with-xendit, Behavior 4–13). The server picks the view from the order
// and the URL's `payment=` value; this only adds what a click changes. Pay now
// and Retry payment are the same action. Messages sit in an aria-live
// container, not role="status" (the page's one status role stays spec 030's).

export type PanelView = Exclude<PaymentView, "none" | "past-due">

type Props = {
  orderNumber: string
  view: PanelView
  // Who "Still confirming" waits for ("Xendit")
  gatewayName: string
}

export function PaymentPanel({
  orderNumber,
  view: initial,
  gatewayName,
}: Props) {
  const router = useRouter()
  const [view, setView] = useState<PanelView>(initial)
  const [busy, setBusy] = useState(false)

  async function pay() {
    if (busy) return
    setBusy(true)
    const key = new URLSearchParams(window.location.search).get("key")
    let result: Awaited<ReturnType<typeof startPaymentAction>> | null = null
    try {
      result = await startPaymentAction({ orderNumber, key })
    } catch {
      // No answer: nothing to go to; the shopper can try again
    }
    if (result?.ok) {
      // Stay busy: the page is leaving for the payment page
      window.location.assign(result.url)
      return
    }
    setBusy(false)
    if (result?.reason === "confirming") setView("confirming")
    else if (result?.reason === "expired") setView("too-late")
    else if (result?.reason === "not-pending") router.refresh()
    else setView("error")
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div aria-live="polite" className="empty:hidden">
        {view === "confirming" ? (
          <Confirming orderNumber={orderNumber} gatewayName={gatewayName} />
        ) : view === "cancelled" ? (
          <p>{PAY_COPY.cancelled}</p>
        ) : view === "error" ? (
          <p className="text-destructive">{PAY_COPY.openFailed}</p>
        ) : view === "too-late" ? (
          <p>{PAY_COPY.tooLate}</p>
        ) : null}
      </div>
      {(view === "pay" || view === "cancelled" || view === "error") && (
        <Button onClick={pay} disabled={busy} aria-busy={busy || undefined}>
          {busy
            ? PAY_COPY.opening
            : view === "cancelled"
              ? PAY_COPY.retry
              : PAY_COPY.payNow}
        </Button>
      )}
    </div>
  )
}

// "Confirming your payment…", then "Still confirming…" after a minute, while
// the status is polled
function Confirming({
  orderNumber,
  gatewayName,
}: {
  orderNumber: string
  gatewayName: string
}) {
  const slow = useOrderStatus(orderNumber)
  return (
    <p className="flex items-center gap-2">
      <LoaderCircleIcon aria-hidden="true" className="size-4 animate-spin" />
      {slow ? stillConfirmingText(gatewayName) : PAY_COPY.confirming}
    </p>
  )
}
