"use client"

import { LoaderCircleIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { startPaymentAction } from "@/app/(store)/orders/[number]/actions"
import { Button } from "@/components/ui/button"
import { useOrderStatus } from "@/hooks/use-order-status"
import { credentialParamsOf } from "@/lib/orders/link"
import { PAY_COPY, stillConfirmingText } from "@/lib/payments/copy"
import type { PaymentView } from "@/lib/payments/payment-view"
import { waitForSession } from "@/lib/payments/wait-for-session"

// The order page's payment area while it is Pending payment (docs/specs/031-
// pay-with-xendit, Behavior 4–13). The server picks the view from the order
// and the URL's `payment=` value; this only adds what a click changes. Pay now
// and Retry payment are the same action; while another start of the order is
// opening a session, the button stays busy and asks again (docs/specs/034-
// start-payment-outside-transaction, behavior 6). Messages sit in an aria-live
// container, not role="status" (the page's one status role stays spec 030's).

export type PanelView = Exclude<PaymentView, "none" | "expired" | "needs-check">

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
    const credential = credentialParamsOf(
      new URLSearchParams(window.location.search)
    )
    // Waits while another start of this order is opening a session, then
    // answers like a single click (docs/specs/034-start-payment-outside-
    // transaction, behavior 6). No answer is an error: the shopper can try
    // again.
    const result = await waitForSession(() =>
      startPaymentAction({ orderNumber, ...credential })
    )
    if (result.ok) {
      // Stay busy: the page is leaving for the payment page
      window.location.assign(result.url)
      return
    }
    setBusy(false)
    if (result.reason === "confirming") setView("confirming")
    else if (result.reason === "expired") {
      // Too late to open a session; past the deadline the page shows the
      // order as cancelled instead (docs/specs/033-release-unpaid-orders)
      setView("too-late")
      router.refresh()
    } else if (result.reason === "not-pending") router.refresh()
    // A payment arrived that needs checking: the page shows only that now
    else if (result.reason === "needs-check") router.refresh()
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
