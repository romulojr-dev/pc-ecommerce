import {
  codHint,
  codOptionName,
  codReasonText,
  COD_COPY,
} from "@/lib/checkout/copy"
import type { ReviewPayment } from "@/lib/checkout/review"
import { cn } from "@/lib/utils"

// The Payment section of the review (docs/specs/038-cash-on-delivery, Behavior
// 3–7): Pay online, or Cash on delivery (Pay on pickup for a pickup order).
// Both are always shown. Cash is disabled, with the reason under it, when the
// store doesn't offer it for this order. Presentational: ReviewStep owns the
// requests, the saved choice and the focus. Focus moves by id, to the option
// the shopper chose, once its answer is on screen.

export const PAYMENT_ONLINE_ID = "checkout-payment-online"
export const PAYMENT_COD_ID = "checkout-payment-cod"
const COD_NOTE_ID = "checkout-payment-cod-note"
const MESSAGE_ID = "checkout-payment-message"

export type PaymentChoiceState = {
  // A choice is being sent as a new review
  busy: "online" | "cod" | null
  // After a saved cash choice fell back to online, or a request failed;
  // announced politely
  message: string | null
  onChoose: (choice: "online" | "cod") => void
}

export const idlePaymentChoice: PaymentChoiceState = {
  busy: null,
  message: null,
  onChoose: () => {},
}

export function PaymentChoice({
  payment,
  pickup,
  total,
  regionName,
  disabled = false,
  state,
}: {
  payment: ReviewPayment
  pickup: boolean
  // The order's total, for the hint and the limit's reason
  total: number | null
  // The delivery region, for the zone's reason
  regionName: string | null
  // Place order is in flight
  disabled?: boolean
  state: PaymentChoiceState
}) {
  const { busy, message, onChoose } = state
  const locked = disabled || busy !== null
  const offered = payment.cod.offered
  const cash = codOptionName(pickup)

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={MESSAGE_ID}>
      <legend className="mb-1 text-base font-medium">{COD_COPY.heading}</legend>

      <label
        className={cn(
          "flex items-start gap-3 rounded-md border p-3 text-sm",
          payment.chosen === "online" && "border-primary"
        )}
      >
        <input
          id={PAYMENT_ONLINE_ID}
          type="radio"
          name="payment"
          value="online"
          className="mt-0.5"
          checked={payment.chosen === "online"}
          disabled={locked}
          onChange={() => onChoose("online")}
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">{COD_COPY.online}</span>
          <span className="text-muted-foreground">{COD_COPY.onlineHint}</span>
        </span>
      </label>

      <label
        className={cn(
          "flex items-start gap-3 rounded-md border p-3 text-sm",
          payment.chosen === "cod" && "border-primary",
          !offered && "text-muted-foreground"
        )}
      >
        <input
          id={PAYMENT_COD_ID}
          type="radio"
          name="payment"
          value="cod"
          className="mt-0.5"
          checked={payment.chosen === "cod"}
          disabled={locked || !offered}
          aria-describedby={COD_NOTE_ID}
          onChange={() => onChoose("cod")}
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">{cash}</span>
          <span id={COD_NOTE_ID} className="text-muted-foreground">
            {payment.cod.offered
              ? codHint(pickup, total ?? 0)
              : codReasonText(payment.cod, {
                  pickup,
                  regionName,
                  limit: payment.limit,
                  total,
                })}
          </span>
        </span>
      </label>

      <p
        id={MESSAGE_ID}
        aria-live="polite"
        className="min-h-4 text-xs text-destructive"
      >
        {message}
      </p>
    </fieldset>
  )
}
