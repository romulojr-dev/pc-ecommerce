"use client"

import { useState } from "react"

import {
  cancelFakeAction,
  expireFakeAction,
  type FakeChoiceResult,
  payFakeAction,
} from "@/app/(store)/test-payment/[id]/actions"
import { Button } from "@/components/ui/button"
import { PAY_COPY } from "@/lib/payments/copy"

// Pay, Cancel and Let it expire on the fake payment page (docs/specs/031-pay-
// with-xendit, Behavior 15). Each sends the session id and the key from the
// address bar, then follows the answer back to the order page. A miss (the
// page went stale) reloads, which shows the closed or 404 state.
export function FakePayButtons({ sessionId }: { sessionId: string }) {
  const [busy, setBusy] = useState(false)

  async function run(action: (input: unknown) => Promise<FakeChoiceResult>) {
    if (busy) return
    setBusy(true)
    const key = new URLSearchParams(window.location.search).get("key")
    try {
      const result = await action({ id: sessionId, key })
      if (result.ok) {
        window.location.assign(result.url)
        return
      }
    } catch {
      // Fall through to a reload
    }
    window.location.reload()
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => run(payFakeAction)} disabled={busy}>
        {PAY_COPY.fakePay}
      </Button>
      <Button
        variant="outline"
        onClick={() => run(cancelFakeAction)}
        disabled={busy}
      >
        {PAY_COPY.fakeCancel}
      </Button>
      <Button
        variant="ghost"
        onClick={() => run(expireFakeAction)}
        disabled={busy}
      >
        {PAY_COPY.fakeExpire}
      </Button>
    </div>
  )
}
