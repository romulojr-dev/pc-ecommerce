"use client"

import { useRouter } from "next/navigation"
import { useId, useRef, useState } from "react"

import { transitionOrderAction } from "@/app/admin/(shell)/orders/[number]/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FULFILLMENT_COPY } from "@/lib/admin/fulfillment-copy"
import {
  type FulfillmentView,
  type Outcome,
  outcomeOf,
} from "@/lib/admin/fulfillment-view"
import {
  COURIER_SUGGESTIONS,
  type ShipFieldErrors,
  shipFieldErrors,
} from "@/lib/orders/transition-input"
import type { OrderStatusName } from "@/lib/orders/timeline"
import { statusLabel } from "@/lib/orders/timeline"

// The Fulfillment section (docs/specs/043-order-fulfillment-transitions,
// B4 to B10): the order's status and its one allowed move. The move opens a
// confirmation; Shipped asks for the courier and tracking number first and
// then shows them prominently before anything is sent. Nothing is sent until
// Confirm, and a close while a request runs is ignored.

type Step = "closed" | "fields" | "confirm"

export function FulfillmentPanel({
  orderNumber,
  status,
  view,
  disabledReason,
}: {
  orderNumber: string
  status: OrderStatusName
  view: FulfillmentView
  // Set when the role may not move orders (Demo): the button is disabled with
  // this text and nothing is sent
  disabledReason: string | null
}) {
  const router = useRouter()
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const [step, setStep] = useState<Step>("closed")
  const [courier, setCourier] = useState("")
  const [tracking, setTracking] = useState("")
  const [errors, setErrors] = useState<ShipFieldErrors>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Extract<
    Outcome,
    { kind: "error" }
  > | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const { choice } = view

  function close() {
    if (pending) return
    setStep("closed")
    setError(null)
    setErrors({})
  }

  function review() {
    const found = shipFieldErrors({ courier, trackingNumber: tracking })
    setErrors(found)
    if (Object.keys(found).length === 0) {
      setError(null)
      setStep("confirm")
    }
  }

  async function confirm() {
    if (!choice || pending) return
    setPending(true)
    setError(null)
    try {
      const answer = await transitionOrderAction({
        orderNumber,
        expectedStatus: status,
        to: choice.to,
        ...(choice.ship
          ? { courier: courier.trim(), trackingNumber: tracking.trim() }
          : {}),
      })
      const outcome = outcomeOf(answer)
      if (outcome.kind === "success") {
        setStep("closed")
        setDone(outcome.text)
        setCourier("")
        setTracking("")
        router.refresh()
        heading.current?.focus()
      } else {
        setError(outcome)
      }
    } catch {
      setError({ kind: "error", text: FULFILLMENT_COPY.failed, stale: false })
    } finally {
      setPending(false)
    }
  }

  function reload() {
    setStep("closed")
    setError(null)
    router.refresh()
    heading.current?.focus()
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-md border p-4"
    >
      <h2
        id={headingId}
        ref={heading}
        tabIndex={-1}
        className="text-base font-semibold outline-none"
      >
        {FULFILLMENT_COPY.heading}
      </h2>
      <p className="text-sm">
        {FULFILLMENT_COPY.currentStatus(statusLabel(status))}
      </p>

      {choice ? (
        <div className="flex flex-col gap-1">
          <Button
            ref={opener}
            className="w-fit"
            disabled={disabledReason !== null || pending}
            aria-describedby={
              disabledReason ? `${headingId}-disabled` : undefined
            }
            onClick={() => {
              setError(null)
              setDone(null)
              setStep(choice.ship ? "fields" : "confirm")
            }}
          >
            {choice.button}
          </Button>
          {disabledReason ? (
            <p
              id={`${headingId}-disabled`}
              className="text-sm text-muted-foreground"
            >
              {disabledReason}
            </p>
          ) : null}
        </div>
      ) : view.reason ? (
        <p className="text-sm text-muted-foreground">{view.reason}</p>
      ) : null}

      <div aria-live="polite" className="text-sm">
        {done}
      </div>

      {choice ? (
        <Dialog
          open={step !== "closed"}
          onOpenChange={(open) => {
            if (!open) close()
          }}
        >
          {step !== "closed" && (
            <DialogContent
              showCloseButton={false}
              className="text-sm"
              finalFocus={opener}
            >
              {step === "fields" ? (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-base">
                      {FULFILLMENT_COPY.shipTitle(orderNumber)}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                      {FULFILLMENT_COPY.detailsEmailed}
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    className="flex flex-col gap-3"
                    noValidate
                    onSubmit={(event) => {
                      event.preventDefault()
                      review()
                    }}
                  >
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`${headingId}-courier`}>
                        {FULFILLMENT_COPY.courier}
                      </Label>
                      <Input
                        id={`${headingId}-courier`}
                        value={courier}
                        list={`${headingId}-couriers`}
                        autoComplete="off"
                        maxLength={60}
                        aria-invalid={errors.courier ? true : undefined}
                        aria-describedby={
                          errors.courier
                            ? `${headingId}-courier-error`
                            : undefined
                        }
                        onChange={(event) => setCourier(event.target.value)}
                      />
                      <datalist id={`${headingId}-couriers`}>
                        {COURIER_SUGGESTIONS.map((name) => (
                          <option key={name} value={name} />
                        ))}
                      </datalist>
                      {errors.courier ? (
                        <p
                          id={`${headingId}-courier-error`}
                          className="text-destructive"
                        >
                          {errors.courier}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`${headingId}-tracking`}>
                        {FULFILLMENT_COPY.trackingNumber}
                      </Label>
                      <Input
                        id={`${headingId}-tracking`}
                        value={tracking}
                        autoComplete="off"
                        maxLength={60}
                        aria-invalid={errors.trackingNumber ? true : undefined}
                        aria-describedby={
                          errors.trackingNumber
                            ? `${headingId}-tracking-error`
                            : undefined
                        }
                        onChange={(event) => setTracking(event.target.value)}
                      />
                      {errors.trackingNumber ? (
                        <p
                          id={`${headingId}-tracking-error`}
                          className="text-destructive"
                        >
                          {errors.trackingNumber}
                        </p>
                      ) : null}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" type="button" onClick={close}>
                        {FULFILLMENT_COPY.cancel}
                      </Button>
                      <Button type="submit">{FULFILLMENT_COPY.next}</Button>
                    </DialogFooter>
                  </form>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-base">
                      {choice.ship
                        ? FULFILLMENT_COPY.checkTitle
                        : FULFILLMENT_COPY.confirmTitle(
                            orderNumber,
                            choice.statusName
                          )}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                      {FULFILLMENT_COPY.describe}
                    </DialogDescription>
                  </DialogHeader>
                  {choice.ship ? (
                    <dl className="flex flex-col gap-2">
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {FULFILLMENT_COPY.courier}
                        </dt>
                        <dd className="text-xl font-semibold break-all">
                          {courier.trim()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {FULFILLMENT_COPY.trackingNumber}
                        </dt>
                        <dd className="text-xl font-semibold break-all">
                          {tracking.trim()}
                        </dd>
                      </div>
                    </dl>
                  ) : null}
                  <ul className="flex flex-col gap-1">
                    {choice.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  {error ? (
                    <div role="alert" className="flex flex-col gap-2">
                      <p className="text-destructive">{error.text}</p>
                      {error.stale ? (
                        <Button
                          variant="outline"
                          className="w-fit"
                          onClick={reload}
                        >
                          {FULFILLMENT_COPY.reload}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  <DialogFooter>
                    {choice.ship ? (
                      <Button
                        variant="outline"
                        disabled={pending}
                        onClick={() => setStep("fields")}
                      >
                        {FULFILLMENT_COPY.back}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        disabled={pending}
                        onClick={close}
                      >
                        {FULFILLMENT_COPY.cancel}
                      </Button>
                    )}
                    <Button
                      disabled={pending}
                      aria-busy={pending || undefined}
                      onClick={confirm}
                    >
                      {pending
                        ? FULFILLMENT_COPY.busy
                        : FULFILLMENT_COPY.confirm}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          )}
        </Dialog>
      ) : null}
    </section>
  )
}
