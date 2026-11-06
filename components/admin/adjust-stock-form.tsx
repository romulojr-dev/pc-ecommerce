"use client"

import { useRouter } from "next/navigation"
import { type FormEvent, useId, useRef, useState } from "react"

import { adjustStockAction } from "@/app/admin/(shell)/inventory/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { INVENTORY_COPY } from "@/lib/admin/inventory-copy"
import {
  type AdjustmentErrors,
  adjustmentFromForm,
  type CheckedAdjustment,
  isStaffReason,
  STAFF_REASONS,
} from "@/lib/admin/inventory-input"
import {
  refusalText,
  resultText,
  reviewState,
  reviewText,
} from "@/lib/admin/inventory-view"
import { cn, focusRing } from "@/lib/utils"

// Adjust stock (docs/specs/046-admin-inventory-adjustments, B9–B12, D2, D9,
// D16): a reason, a positive quantity (and a direction for a Correction) and
// a note, then a REVIEW step that shows "Stock 12 → 112. Received +100." and
// writes nothing until Confirm. The wire format is the signed delta. Confirm
// is withheld when the figure would pass 0 or 1,000,000, and is disabled while
// the request is pending (the only protection against a double submit, D9).

const COPY = INVENTORY_COPY
const controlClass =
  "h-7 w-full min-w-0 rounded-md border border-input bg-input/20 px-2 text-xs/relaxed outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60 dark:bg-input/30"

type FormValues = {
  reason: string
  quantity: string
  direction: string
  note: string
}
const EMPTY: FormValues = { reason: "", quantity: "", direction: "", note: "" }

export function AdjustStockForm({
  productId,
  stock,
  readOnly,
}: {
  productId: string
  // The stock the page loaded with; the confirm step and the preview use it
  stock: number
  readOnly: boolean
}) {
  const router = useRouter()
  const formId = useId()
  const summary = useRef<HTMLDivElement>(null)
  const [values, setValues] = useState<FormValues>(EMPTY)
  const [errors, setErrors] = useState<AdjustmentErrors>({})
  const [reviewing, setReviewing] = useState<CheckedAdjustment | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const set = (key: keyof FormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const draft = adjustmentFromForm(values)
  const preview = draft.ok ? reviewState(stock, draft.value.delta).after : null
  const errorItems = Object.entries(errors).filter(
    (entry): entry is [string, string] => Boolean(entry[1])
  )

  function focusSummary() {
    requestAnimationFrame(() => summary.current?.focus())
  }

  function review(event: FormEvent) {
    event.preventDefault()
    if (readOnly || pending) return
    setMessage(null)
    const checked = adjustmentFromForm(values)
    if (!checked.ok) {
      setErrors(checked.errors)
      focusSummary()
      return
    }
    setErrors({})
    setReviewing(checked.value)
  }

  async function confirm() {
    if (readOnly || pending || !reviewing) return
    setPending(true)
    setMessage(null)
    try {
      const answer = await adjustStockAction({
        productId,
        reason: reviewing.reason,
        delta: reviewing.delta,
        note: values.note,
        shownStock: stock,
      })
      if (!answer.ok) {
        setReviewing(null)
        setMessage(answer.message)
        return
      }
      const result = answer.data
      switch (result.kind) {
        case "adjusted":
          setValues(EMPTY)
          setReviewing(null)
          setMessage(
            resultText({
              newStock: result.stock,
              delta: result.delta,
              shownStock: stock,
            })
          )
          router.refresh()
          break
        case "refused":
          setReviewing(null)
          setMessage(refusalText(result.refusal, reviewing.delta))
          router.refresh()
          break
        case "invalid":
          setReviewing(null)
          setErrors(result.errors)
          break
        case "not-found":
          setReviewing(null)
          setMessage(COPY.notFound)
          break
      }
    } catch {
      setReviewing(null)
      setMessage(COPY.failed)
    } finally {
      setPending(false)
      focusSummary()
    }
  }

  const reviewInfo = reviewing ? reviewState(stock, reviewing.delta) : null
  const isCorrection = values.reason === "CORRECTION"

  return (
    <form
      onSubmit={review}
      noValidate
      className="flex max-w-xl flex-col gap-3"
      aria-labelledby={`${formId}-heading`}
    >
      <h2 id={`${formId}-heading`} className="text-lg font-semibold">
        {COPY.adjust.heading}
      </h2>
      {readOnly ? <p className="text-sm">{COPY.readOnly}</p> : null}

      <div
        ref={summary}
        tabIndex={-1}
        className="outline-none"
        aria-live="polite"
      >
        {errorItems.length > 0 ? (
          <div
            role="alert"
            className="rounded-md border border-destructive p-3"
          >
            <p className="font-medium">{COPY.summary(errorItems.length)}</p>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {errorItems.map(([key, text]) => (
                <li key={key}>
                  <a
                    href={`#${formId}-${key}`}
                    className={cn("underline underline-offset-4", focusRing)}
                  >
                    {labelOf(key)}
                  </a>
                  : {text}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {message ? <p className="text-sm font-medium">{message}</p> : null}
      </div>

      {reviewing && reviewInfo ? (
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <p className="font-medium">
            {reviewText(stock, reviewing.reason, reviewing.delta)}
          </p>
          {reviewing.note ? (
            <p className="text-sm text-muted-foreground">{reviewing.note}</p>
          ) : null}
          {reviewInfo.message ? (
            <p role="alert" className="text-sm text-destructive">
              {reviewInfo.message}
            </p>
          ) : null}
          <div className="flex gap-2">
            {reviewInfo.status === "ok" ? (
              <Button
                type="button"
                onClick={confirm}
                disabled={pending || readOnly}
                aria-busy={pending}
              >
                {pending ? COPY.adjust.confirming : COPY.adjust.confirm}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => setReviewing(null)}
              disabled={pending}
            >
              {COPY.adjust.back}
            </Button>
          </div>
        </div>
      ) : (
        <fieldset disabled={readOnly} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${formId}-reason`}>{COPY.adjust.reason}</Label>
            <select
              id={`${formId}-reason`}
              className={controlClass}
              value={values.reason}
              aria-invalid={Boolean(errors.reason)}
              onChange={(event) => set("reason", event.target.value)}
            >
              <option value="">{COPY.adjust.chooseReason}</option>
              {STAFF_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {COPY.reasons[reason]}
                </option>
              ))}
            </select>
            {isStaffReason(values.reason) ? (
              <p className="text-xs text-muted-foreground">
                {COPY.adjust.hints[values.reason]}
              </p>
            ) : null}
            <FieldError text={errors.reason} />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${formId}-quantity`}>{COPY.adjust.quantity}</Label>
            <Input
              id={`${formId}-quantity`}
              inputMode="numeric"
              autoComplete="off"
              value={values.quantity}
              aria-invalid={Boolean(errors.quantity)}
              onChange={(event) => set("quantity", event.target.value)}
            />
            <FieldError text={errors.quantity} />
          </div>

          {isCorrection ? (
            <fieldset className="flex flex-col gap-1">
              <legend className="text-xs/relaxed font-medium">
                {COPY.adjust.direction}
              </legend>
              <div className="flex gap-4 text-sm">
                {(["add", "remove"] as const).map((direction) => (
                  <label key={direction} className="flex items-center gap-1">
                    <input
                      type="radio"
                      name={`${formId}-direction`}
                      value={direction}
                      checked={values.direction === direction}
                      onChange={() => set("direction", direction)}
                    />
                    {COPY.adjust[direction]}
                  </label>
                ))}
              </div>
              <FieldError text={errors.direction} />
            </fieldset>
          ) : null}

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${formId}-note`}>
              {isCorrection ? COPY.adjust.noteRequired : COPY.adjust.note}
            </Label>
            <textarea
              id={`${formId}-note`}
              rows={3}
              maxLength={600}
              className={cn(controlClass, "h-auto py-1")}
              value={values.note}
              aria-invalid={Boolean(errors.note)}
              onChange={(event) => set("note", event.target.value)}
            />
            <FieldError text={errors.note} />
          </div>

          {preview !== null ? (
            <p className="text-sm text-muted-foreground">
              {COPY.adjust.preview(preview)}
            </p>
          ) : null}

          {readOnly ? null : (
            <div>
              <Button type="submit">{COPY.adjust.review}</Button>
            </div>
          )}
        </fieldset>
      )}
    </form>
  )
}

function labelOf(key: string): string {
  switch (key) {
    case "reason":
      return COPY.adjust.reason
    case "quantity":
      return COPY.adjust.quantity
    case "direction":
      return COPY.adjust.direction
    default:
      return COPY.adjust.note
  }
}

function FieldError({ text }: { text?: string }) {
  return text ? <p className="text-xs text-destructive">{text}</p> : null
}
