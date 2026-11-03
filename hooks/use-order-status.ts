"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { credentialHeaders, credentialParamsOf } from "@/lib/orders/link"
import { startStatusPoller } from "@/lib/payments/status-poller"

// While the return page confirms a payment, ask for the order's status
// (docs/specs/031-pay-with-xendit, Behavior 7–8). When it leaves Pending
// payment, the page is replaced by the order link without its `payment=`
// value, so the server renders the new status. Returns whether the first
// minute has passed ("Still confirming").
//
// The credential (the key, or a signed link's parameters) is read from the
// address bar and sent in a header, never in the status route's URL.
export function useOrderStatus(orderNumber: string): boolean {
  const router = useRouter()
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const headers = credentialHeaders(credentialParamsOf(params))

    const poller = startStatusPoller({
      async fetchStatus() {
        const response = await fetch(
          `/api/orders/${encodeURIComponent(orderNumber)}/status`,
          { headers, cache: "no-store" }
        )
        if (!response.ok) return null
        const body: unknown = await response.json()
        return typeof body === "object" &&
          body !== null &&
          "status" in body &&
          typeof body.status === "string"
          ? body.status
          : null
      },
      onSettled() {
        params.delete("payment")
        router.replace(`${window.location.pathname}?${params}`)
      },
      onSlow: () => setSlow(true),
      isHidden: () => document.hidden,
    })
    const onVisibility = () => poller.visibilityChanged()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      poller.stop()
    }
  }, [orderNumber, router])

  return slow
}
