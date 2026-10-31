"use client"

import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ORDER_COPY } from "@/lib/orders/copy"

type State = "idle" | "copied" | "failed"

// "Save this link" with the link and a Copy link button (docs/specs/030-place-
// an-order, Behavior 18). It copies window.location.href, so the key is
// exactly what the browser has. The server render and the first client render
// both show an empty field, which is filled after mounting (no hydration
// mismatch). A refused clipboard selects the field so the shopper can copy by
// hand.
export function CopyLink() {
  const [href, setHref] = useState("")
  const [state, setState] = useState<State>("idle")
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only known in the browser
    setHref(window.location.href)
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setState("copied")
    } catch {
      setState("failed")
      input.current?.select()
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
      <p>{ORDER_COPY.saveLink}</p>
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label htmlFor="order-link">{ORDER_COPY.linkLabel}</Label>
          <Input
            id="order-link"
            ref={input}
            readOnly
            value={href}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
        <Button type="button" variant="outline" onClick={() => void copy()}>
          {state === "copied" ? ORDER_COPY.copied : ORDER_COPY.copy}
        </Button>
      </div>
      <p aria-live="polite" className="min-h-5 text-muted-foreground">
        {state === "copied"
          ? ORDER_COPY.copied
          : state === "failed"
            ? ORDER_COPY.copyFailed
            : ""}
      </p>
    </section>
  )
}
