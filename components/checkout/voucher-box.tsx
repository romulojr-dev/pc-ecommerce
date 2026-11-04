import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { VOUCHER_COPY, voucherAppliedText } from "@/lib/checkout/copy"

// The voucher code box in the review's summary (docs/specs/037-vouchers-at-
// checkout, Behavior 3–7). Presentational: ReviewStep owns the requests, the
// saved code and the focus. Focus moves by id, like the problem summary does:
// to Remove after a code is applied, to the field after a Remove or a refusal.

export const VOUCHER_INPUT_ID = "checkout-voucher-code"
export const VOUCHER_REMOVE_ID = "checkout-voucher-remove"
const MESSAGE_ID = "checkout-voucher-message"

export type VoucherBoxState = {
  // What is typed in the field
  text: string
  onText: (text: string) => void
  // A request is in flight: Apply or Remove
  busy: "apply" | "remove" | null
  // Why the code was refused, or that the request failed; announced politely
  message: string | null
  onApply: () => void
  onRemove: () => void
}

export const idleVoucherBox: VoucherBoxState = {
  text: "",
  onText: () => {},
  busy: null,
  message: null,
  onApply: () => {},
  onRemove: () => {},
}

export function VoucherBox({
  applied,
  disabled = false,
  state,
}: {
  // The code the review applied, or null
  applied: string | null
  // Place order is in flight
  disabled?: boolean
  state: VoucherBoxState
}) {
  const { text, onText, busy, message, onApply, onRemove } = state
  const locked = disabled || busy !== null

  if (applied) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium">{voucherAppliedText(applied)}</p>
          <Button
            id={VOUCHER_REMOVE_ID}
            type="button"
            variant="outline"
            size="sm"
            disabled={locked}
            aria-busy={busy === "remove"}
            onClick={onRemove}
          >
            {busy === "remove" ? VOUCHER_COPY.removing : VOUCHER_COPY.remove}
          </Button>
        </div>
        <p
          id={MESSAGE_ID}
          aria-live="polite"
          className="min-h-0 text-xs text-destructive"
        >
          {message}
        </p>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        if (!locked) onApply()
      }}
    >
      <Label htmlFor={VOUCHER_INPUT_ID}>{VOUCHER_COPY.label}</Label>
      <div className="flex gap-2">
        <Input
          id={VOUCHER_INPUT_ID}
          value={text}
          maxLength={32}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={locked}
          aria-invalid={message ? true : undefined}
          aria-describedby={MESSAGE_ID}
          onChange={(event) => onText(event.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={locked}
          aria-busy={busy === "apply"}
        >
          {busy === "apply" ? VOUCHER_COPY.applying : VOUCHER_COPY.apply}
        </Button>
      </div>
      <p
        id={MESSAGE_ID}
        aria-live="polite"
        className="min-h-4 text-xs text-destructive"
      >
        {message}
      </p>
    </form>
  )
}
