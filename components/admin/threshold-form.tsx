"use client"

import { useRouter } from "next/navigation"
import { type FormEvent, useId, useState } from "react"

import { setLowStockAtAction } from "@/app/admin/(shell)/inventory/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { INVENTORY_COPY } from "@/lib/admin/inventory-copy"
import { thresholdFromText } from "@/lib/admin/inventory-input"

// The low-stock threshold (docs/specs/046-admin-inventory-adjustments, B13,
// D6): a setting, so it is set rather than added, and it never touches the
// product's edit version. Saving the current value says so and writes nothing.

const COPY = INVENTORY_COPY.threshold

export function ThresholdForm({
  productId,
  lowStockAt,
  readOnly,
}: {
  productId: string
  lowStockAt: number
  readOnly: boolean
}) {
  const router = useRouter()
  const formId = useId()
  const [text, setText] = useState(String(lowStockAt))
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (readOnly || pending) return
    setMessage(null)
    const checked = thresholdFromText(text)
    if (!checked.ok) {
      setError(checked.error)
      return
    }
    setError(null)
    setPending(true)
    try {
      const answer = await setLowStockAtAction({
        productId,
        lowStockAt: checked.value,
      })
      if (!answer.ok) {
        setMessage(answer.message)
        return
      }
      const result = answer.data
      if (result.kind === "saved") {
        setMessage(COPY.saved)
        router.refresh()
      } else if (result.kind === "unchanged") {
        setMessage(INVENTORY_COPY.noChanges)
      } else if (result.kind === "invalid") {
        setError(result.error)
      } else {
        setMessage(INVENTORY_COPY.notFound)
      }
    } catch {
      setMessage(INVENTORY_COPY.thresholdFailed)
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex max-w-xl flex-col gap-2"
      aria-labelledby={`${formId}-heading`}
    >
      <h2 id={`${formId}-heading`} className="text-lg font-semibold">
        {COPY.heading}
      </h2>
      <fieldset disabled={readOnly} className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-value`}>{COPY.label}</Label>
        <div className="flex items-start gap-2">
          <Input
            id={`${formId}-value`}
            inputMode="numeric"
            autoComplete="off"
            className="w-28"
            value={text}
            aria-invalid={Boolean(error)}
            aria-describedby={`${formId}-hint${error ? ` ${formId}-error` : ""}`}
            onChange={(event) => {
              setText(event.target.value)
              setError(null)
            }}
          />
          {readOnly ? null : (
            <Button type="submit" disabled={pending}>
              {COPY.save}
            </Button>
          )}
        </div>
        <p id={`${formId}-hint`} className="text-xs text-muted-foreground">
          {COPY.hint}
        </p>
        {error ? (
          <p id={`${formId}-error`} className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </fieldset>
      <p aria-live="polite" className="text-sm font-medium">
        {message}
      </p>
    </form>
  )
}
