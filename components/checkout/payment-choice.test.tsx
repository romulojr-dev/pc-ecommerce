import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { ReviewPayment } from "@/lib/checkout/review"

import {
  idlePaymentChoice,
  PAYMENT_COD_ID,
  PAYMENT_ONLINE_ID,
  PaymentChoice,
  type PaymentChoiceState,
} from "./payment-choice"

// docs/specs/038-cash-on-delivery: O5–O7, the Payment section as markup. The
// requests, the saved choice and the focus are ReviewStep's.

const offered: ReviewPayment = {
  requested: "online",
  chosen: "online",
  cod: { offered: true },
  limit: 5_000_000,
}

const render = (
  payment: ReviewPayment,
  props: {
    pickup?: boolean
    total?: number | null
    regionName?: string | null
    disabled?: boolean
    state?: PaymentChoiceState
  } = {}
) =>
  renderToStaticMarkup(
    <PaymentChoice
      payment={payment}
      pickup={props.pickup ?? false}
      total={props.total === undefined ? 2_311_000 : props.total}
      regionName={
        props.regionName === undefined
          ? "National Capital Region (NCR)"
          : props.regionName
      }
      disabled={props.disabled}
      state={props.state ?? idlePaymentChoice}
    />
  )

// The tag of the radio with this id
function radio(html: string, id: string): string {
  const at = html.indexOf(`id="${id}"`)
  if (at === -1) throw new Error(`no radio ${id}`)
  const start = html.lastIndexOf("<input", at)
  return html.slice(start, html.indexOf(">", at) + 1)
}
const isDisabled = (tag: string) => /\sdisabled(?:=""|\s|>)/.test(tag)
const isChecked = (tag: string) => /\schecked(?:=""|\s|>)/.test(tag)
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")

describe("the Payment section", () => {
  it("O5: shows both options, online chosen, with what each means", () => {
    const html = render(offered)

    expect(html).toContain("<legend")
    expect(textOf(html)).toContain("Payment")
    expect(textOf(html)).toContain("Pay online")
    expect(textOf(html)).toContain(
      "GCash, Maya or card. You'll pay on the next page."
    )
    expect(textOf(html)).toContain("Cash on delivery")
    expect(textOf(html)).toContain(
      "Pay ₱23,110.00 in cash when your order arrives."
    )
    expect(isChecked(radio(html, PAYMENT_ONLINE_ID))).toBe(true)
    expect(isChecked(radio(html, PAYMENT_COD_ID))).toBe(false)
    expect(isDisabled(radio(html, PAYMENT_COD_ID))).toBe(false)
  })

  it("O5: with cash chosen, the cash radio is the checked one", () => {
    const html = render({ ...offered, requested: "cod", chosen: "cod" })

    expect(isChecked(radio(html, PAYMENT_COD_ID))).toBe(true)
    expect(isChecked(radio(html, PAYMENT_ONLINE_ID))).toBe(false)
  })

  it("O5: a pickup order calls it Pay on pickup and says where", () => {
    const html = render(offered, { pickup: true, total: 579_500 })

    expect(textOf(html)).toContain("Pay on pickup")
    expect(textOf(html)).not.toContain("Cash on delivery")
    expect(textOf(html)).toContain(
      "Pay ₱5,795.00 at the store when you collect your order."
    )
  })

  it.each([
    [
      "disabled",
      { offered: false, reason: "disabled" } as const,
      "Cash on delivery isn't available right now.",
    ],
    [
      "zone",
      { offered: false, reason: "zone" } as const,
      "Cash on delivery isn't available in National Capital Region (NCR).",
    ],
    [
      "over-limit",
      { offered: false, reason: "over-limit", overBy: 2_501_000 } as const,
      "Cash on delivery is for orders up to ₱50,000.00. Your total is ₱23,110.00.",
    ],
    [
      "no-total",
      { offered: false, reason: "no-total" } as const,
      "Cash on delivery isn't available until we can deliver to this address.",
    ],
  ])(
    "O6: %s disables cash and says why, tied to the radio",
    (_n, cod, reason) => {
      const html = render({ ...offered, cod })
      const tag = radio(html, PAYMENT_COD_ID)

      expect(isDisabled(tag)).toBe(true)
      expect(isDisabled(radio(html, PAYMENT_ONLINE_ID))).toBe(false)
      expect(isChecked(radio(html, PAYMENT_ONLINE_ID))).toBe(true)
      expect(textOf(html)).toContain(reason)
      // the reason is the radio's description
      expect(tag).toContain('aria-describedby="checkout-payment-cod-note"')
      expect(html).toContain('id="checkout-payment-cod-note"')
      expect(textOf(html)).not.toContain("in cash when your order arrives")
    }
  )

  it("O6: pay on pickup switched off reads as Pay on pickup", () => {
    const html = render(
      { ...offered, cod: { offered: false, reason: "pickup-off" } },
      { pickup: true }
    )

    expect(isDisabled(radio(html, PAYMENT_COD_ID))).toBe(true)
    expect(textOf(html)).toContain("Pay on pickup isn't available right now.")
  })

  it("O6: a fallback note after a saved choice is read politely", () => {
    const html = render(
      { ...offered, requested: "cod", cod: { offered: false, reason: "zone" } },
      {
        state: {
          ...idlePaymentChoice,
          message:
            "Cash on delivery isn't available in Mindanao. We've switched you to online payment.",
        },
      }
    )

    expect(html).toContain('aria-live="polite"')
    expect(textOf(html)).toContain("We've switched you to online payment.")
    expect(isChecked(radio(html, PAYMENT_ONLINE_ID))).toBe(true)
  })
})

describe("the Payment section in flight", () => {
  it("O7: a choice being sent locks both radios", () => {
    const html = render(offered, {
      state: { ...idlePaymentChoice, busy: "cod" },
    })

    expect(isDisabled(radio(html, PAYMENT_ONLINE_ID))).toBe(true)
    expect(isDisabled(radio(html, PAYMENT_COD_ID))).toBe(true)
  })

  it("O7: placing the order locks them too", () => {
    const html = render(offered, { disabled: true })

    expect(isDisabled(radio(html, PAYMENT_ONLINE_ID))).toBe(true)
    expect(isDisabled(radio(html, PAYMENT_COD_ID))).toBe(true)
  })
})
