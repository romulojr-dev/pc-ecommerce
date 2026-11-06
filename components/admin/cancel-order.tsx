"use client"

import { useId, useRef, useState } from "react"

import { cancelOrderAction } from "@/app/admin/(shell)/orders/[number]/actions"
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
  type CancelView,
  cancelOutcomeOf,
  type Outcome,
} from "@/lib/admin/fulfillment-view"
import {
  CANCEL_MESSAGES,
  CANCEL_REASON_LABELS,
  noteError,
  STAFF_CANCEL_REASONS,
  type StaffCancelReason,
} from "@/lib/orders/cancel"
import type { OrderStatusName } from "@/lib/orders/timeline"

// Cancel order (docs/specs/044-admin-cancel-order, B5 to B12): a button in the
// Fulfillment section that opens a dialog. The reason is required and none is
// preselected; Other also needs an internal note. The dialog lists what will
// happen, and nothing is sent until Confirm. A close while a request runs is
// ignored.

const c = FULFILLMENT_COPY.cancelOrder

export function CancelOrder({
  orderNumber,
  status,
  view,
  disabledReason,
  onDone,
  onReload,
}: {
  orderNumber: string
  status: OrderStatusName
  view: CancelView
  // Set when the role may not cancel (Demo): the button is disabled with this
  // text and nothing is sent
  disabledReason: string | null
  onDone: (text: string) => void
  onReload: () => void
}) {
  const id = useId()
  const opener = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<StaffCancelReason | null>(null)
  const [note, setNote] = useState("")
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [noteProblem, setNoteProblem] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Extract<
    Outcome,
    { kind: "error" }
  > | null>(null)

  if (view.kind === "none") return null
  if (view.kind === "blocked") {
    return <p className="text-sm text-muted-foreground">{view.text}</p>
  }

  function close() {
    if (pending) return
    setOpen(false)
    setError(null)
    setReasonError(null)
    setNoteProblem(null)
  }

  async function confirm() {
    if (pending || view.kind !== "available") return
    if (reason === null) {
      setReasonError(CANCEL_MESSAGES.reasonRequired)
      return
    }
    if (reason === "OTHER") {
      const problem = noteError(note)
      setNoteProblem(problem)
      if (problem) return
    }
    setPending(true)
    setError(null)
    try {
      const answer = await cancelOrderAction({
        orderNumber,
        expectedStatus: status,
        reason,
        ...(reason === "OTHER" ? { note: note.trim() } : {}),
      })
      const outcome = cancelOutcomeOf(answer)
      if (outcome.kind === "success") {
        setOpen(false)
        setReason(null)
        setNote("")
        onDone(outcome.text)
      } else {
        setError(outcome)
      }
    } catch {
      setError({ kind: "error", text: c.failed, stale: false })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        ref={opener}
        variant="destructive"
        className="w-fit"
        disabled={disabledReason !== null || pending}
        aria-describedby={disabledReason ? `${id}-disabled` : undefined}
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        {c.button}
      </Button>
      {disabledReason ? (
        <p id={`${id}-disabled`} className="text-sm text-muted-foreground">
          {disabledReason}
        </p>
      ) : null}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close()
        }}
      >
        {open && (
          <DialogContent
            showCloseButton={false}
            className="text-sm"
            finalFocus={opener}
          >
            <DialogHeader>
              <DialogTitle className="text-base">
                {c.title(orderNumber)}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {c.describe}
              </DialogDescription>
            </DialogHeader>

            <fieldset
              className="flex flex-col gap-2"
              aria-describedby={reasonError ? `${id}-reason-error` : undefined}
            >
              <legend className="mb-1 font-medium">{c.reason}</legend>
              {STAFF_CANCEL_REASONS.map((value) => (
                <label key={value} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${id}-reason`}
                    value={value}
                    checked={reason === value}
                    disabled={pending}
                    onChange={() => {
                      setReason(value)
                      setReasonError(null)
                    }}
                  />
                  {CANCEL_REASON_LABELS[value]}
                </label>
              ))}
              {reasonError ? (
                <p id={`${id}-reason-error`} className="text-destructive">
                  {reasonError}
                </p>
              ) : null}
            </fieldset>

            {reason === "OTHER" ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${id}-note`}>{c.note}</Label>
                <Input
                  id={`${id}-note`}
                  value={note}
                  autoComplete="off"
                  maxLength={220}
                  disabled={pending}
                  aria-invalid={noteProblem ? true : undefined}
                  aria-describedby={`${id}-note-hint${
                    noteProblem ? ` ${id}-note-error` : ""
                  }`}
                  onChange={(event) => setNote(event.target.value)}
                />
                <p
                  id={`${id}-note-hint`}
                  className="text-xs text-muted-foreground"
                >
                  {c.noteHint}
                </p>
                {noteProblem ? (
                  <p id={`${id}-note-error`} className="text-destructive">
                    {noteProblem}
                  </p>
                ) : null}
              </div>
            ) : null}

            <ul className="flex flex-col gap-1">
              {view.effects.map((line) => (
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
                    onClick={() => {
                      setOpen(false)
                      setError(null)
                      onReload()
                    }}
                  >
                    {FULFILLMENT_COPY.reload}
                  </Button>
                ) : null}
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="outline" disabled={pending} onClick={close}>
                {c.back}
              </Button>
              <Button
                variant="destructive"
                disabled={pending}
                aria-busy={pending || undefined}
                onClick={confirm}
              >
                {pending ? c.busy : c.confirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
