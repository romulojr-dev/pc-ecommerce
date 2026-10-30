import type { ReactNode } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

// The checkout form's field shell: a label, an optional hint, the control and
// its error, tied together with ids (docs/specs/029-checkout-steps,
// Behavior 13)

export const fieldId = (name: string) => `checkout-${name}`

export function Field({
  name,
  label,
  hint,
  error,
  children,
}: {
  name: string
  label: string
  hint?: string
  error?: string
  // The control, given the ids it needs
  children: (aria: {
    id: string
    "aria-invalid": true | undefined
    "aria-describedby": string | undefined
  }) => ReactNode
}) {
  const id = fieldId(name)
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export function TextField({
  name,
  label,
  hint,
  error,
  value,
  onChange,
  ...input
}: {
  name: string
  label: string
  hint?: string
  error?: string
  value: string
  onChange: (value: string) => void
} & Omit<React.ComponentProps<"input">, "value" | "onChange" | "name">) {
  return (
    <Field name={name} label={label} hint={hint} error={error}>
      {(aria) => (
        <Input
          {...input}
          {...aria}
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  )
}

// A native select: the same look as Input, and the platform's own keyboard
// and screen reader behaviour
export const selectClass = cn(
  "h-7 w-full min-w-0 rounded-md border border-input bg-input/20 px-2 py-0.5 text-sm transition-colors outline-none",
  "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:bg-input/30"
)
