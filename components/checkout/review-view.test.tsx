import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { CheckoutReview } from "@/lib/checkout/review"
import type { ReviewProblem } from "@/lib/checkout/problems"

import type { PaymentChoiceState } from "./payment-choice"
import { type ReviewOk, ReviewView } from "./review-view"
import { idleVoucherBox, type VoucherBoxState } from "./voucher-box"

// docs/specs/030-place-an-order: Z1 and Place order's states, as markup

function result(
  options: {
    ordersEnabled?: boolean
    problems?: ReviewProblem[]
    holdHours?: number
    voucher?: CheckoutReview["voucher"]
    discount?: number
    threshold?: number | null
  } = {}
): ReviewOk {
  const problems = options.problems ?? []
  return {
    ok: true,
    ordersEnabled: options.ordersEnabled ?? true,
    holdHours: options.holdHours ?? 24,
    digest: "a".repeat(64),
    idempotencyKey: "k".repeat(22),
    accessToken: "t".repeat(43),
    contact: {
      email: "ana@example.com",
      name: "Ana Santos",
      mobile: "+639171234567",
    },
    address: null,
    store: { address: "Demo Store", hours: "Mon–Sat" },
    review: {
      method: "pickup",
      view: { entries: [], subtotal: 2_299_000, count: 2, flagged: 0 },
      subtotal: 2_299_000,
      weightGrams: 900,
      shipping: { ok: true, fee: 0, basis: "pickup" },
      discount: options.discount ?? 0,
      voucher: options.voucher ?? { kind: "none" },
      payment: {
        requested: "online",
        chosen: "online",
        cod: { offered: true },
        limit: 5_000_000,
      },
      total: 2_299_000 - (options.discount ?? 0),
      threshold: options.threshold ?? null,
      problems,
      warnings: [],
      canPlace: problems.length === 0,
    } as unknown as CheckoutReview,
  }
}

const render = (
  r: ReviewOk,
  props: {
    placing?: boolean
    voucher?: VoucherBoxState
    payment?: PaymentChoiceState
  } = {}
): string =>
  renderToStaticMarkup(
    <ReviewView result={r} onCheckAgain={() => {}} {...props} />
  )

// Tailwind classes contain "disabled:", so look for the attribute itself
const isDisabled = (button: string) => /\sdisabled(?:=""|\s|>)/.test(button)

// The whole tag of the button with this label: from the last "<button" before
// the label to the closing tag
function buttonLabelled(html: string, label: string): string {
  const at = html.indexOf(`>${label}</button>`)
  if (at === -1) throw new Error(`no button labelled ${label}`)
  const start = html.lastIndexOf("<button", at)
  return html.slice(start, at + label.length + 10)
}

const placeButton = (html: string) =>
  html.includes(">Placing your order…</button>")
    ? buttonLabelled(html, "Placing your order…")
    : buttonLabelled(html, "Place order")

describe("Place order", () => {
  it("is enabled for a clean review with the switch on, with the hold time under it", () => {
    const html = render(result())
    expect(isDisabled(placeButton(html))).toBe(false)
    expect(placeButton(html)).toContain("Place order")
    expect(html).toContain(
      "Your parts are held for 24 hours after you place your order."
    )
    expect(html).not.toContain("Placing orders is coming soon.")
  })

  it("says 1 hour for a one-hour hold", () => {
    expect(render(result({ holdHours: 1 }))).toContain(
      "Your parts are held for 1 hour after you place your order."
    )
  })

  it("Z1: is disabled with the coming-soon note when the switch is off", () => {
    const html = render(result({ ordersEnabled: false }))
    expect(isDisabled(placeButton(html))).toBe(true)
    expect(html).toContain("Placing orders is coming soon.")
    expect(html).not.toContain("Your parts are held")
  })

  it("is disabled, with no note, when the review has problems", () => {
    const html = render(
      result({
        problems: [{ kind: "no-rate", region: "Region XI (Davao Region)" }],
      })
    )
    expect(isDisabled(placeButton(html))).toBe(true)
    expect(html).not.toContain("Your parts are held")
    expect(html).not.toContain("Placing orders is coming soon.")
  })

  it("is disabled and busy while placing", () => {
    const html = render(result(), { placing: true })
    const button = placeButton(html)
    expect(isDisabled(button)).toBe(true)
    expect(button).toContain('aria-busy="true"')
    expect(button).toContain("Placing your order…")
  })

  it("disables Check again while placing", () => {
    const html = render(result(), { placing: true })
    expect(isDisabled(buttonLabelled(html, "Check again"))).toBe(true)
  })
})

// docs/specs/037-vouchers-at-checkout: O4 and the summary's rows
describe("the summary with a voucher", () => {
  const applied = {
    voucher: { kind: "applied", code: "WELCOME10", discount: 229_900 },
    discount: 229_900,
  } as const

  it("O4: shows the code applied with Remove, and no Apply", () => {
    const html = render(result(applied))
    expect(html).toContain("WELCOME10 applied")
    expect(html).toContain(">Remove</button>")
    expect(html).not.toContain(">Apply</button>")
    expect(html).not.toContain("Voucher code")
  })

  it("O4: lists Subtotal, Shipping, Discount (CODE), Total in that order", () => {
    const html = render(result(applied))
    const at = (text: string) => html.indexOf(text)
    expect(html).toContain("Discount (WELCOME10)")
    expect(html).toContain("−₱2,299.00")
    expect(at("Subtotal")).toBeLessThan(at("Shipping"))
    expect(at("Shipping")).toBeLessThan(at("Discount (WELCOME10)"))
    expect(at("Discount (WELCOME10)")).toBeLessThan(at(">Total<"))
  })

  it("O4: leaves the threshold note exactly as it was", () => {
    const html = render(result({ ...applied, threshold: 7_500_000 }))
    expect(html).toContain("Free shipping on orders of ₱75,000.00 or more.")
    expect(html).not.toContain("after your discount")
  })

  it("shows the field and Apply when no code is applied, with no Discount row", () => {
    const html = render(result())
    expect(html).toContain("Voucher code")
    expect(html).toContain(">Apply</button>")
    expect(html).not.toContain("Discount")
    expect(html).not.toContain("applied")
  })

  it("shows no Discount row for a refused code", () => {
    const html = render(
      result({
        voucher: { kind: "refused", refusal: { reason: "unknown" } },
      })
    )
    expect(html).not.toContain("Discount")
    expect(html).toContain(">Apply</button>")
  })

  it("disables Place order and Check again while a voucher request is in flight", () => {
    const html = render(result(), {
      voucher: { ...idleVoucherBox, busy: "apply" },
    })
    expect(isDisabled(placeButton(html))).toBe(true)
    expect(isDisabled(buttonLabelled(html, "Check again"))).toBe(true)
  })
})

// docs/specs/038-cash-on-delivery: O5–O7 in the whole review
describe("the Payment section in the review", () => {
  const withPayment = (payment: CheckoutReview["payment"]): ReviewOk => {
    const base = result()
    return { ...base, review: { ...base.review, payment } }
  }
  const cashChosen = withPayment({
    requested: "cod",
    chosen: "cod",
    cod: { offered: true },
    limit: 5_000_000,
  })

  it("O5: shows the section above the items, online chosen by default", () => {
    const html = render(result())

    expect(html).toContain("Pay online")
    // the fixture is a pickup review
    expect(html).toContain("Pay on pickup")
    expect(html.indexOf("<legend")).toBeLessThan(html.indexOf("Items"))
    // no Payment row for an online order
    expect(html).not.toContain("<dt>Payment</dt>")
    expect(html).toContain(
      "Your parts are held for 24 hours after you place your order."
    )
  })

  it("O5: with cash chosen the summary names it and the note says to confirm by email", () => {
    const html = render(cashChosen)

    expect(html).toContain("<dt>Payment</dt>")
    expect(html).toContain("<dd>Pay on pickup</dd>")
    expect(html).toContain(
      "Confirm your order from the email we send you, or it is cancelled."
    )
    expect(isDisabled(placeButton(html))).toBe(false)
  })

  it("O7: a choice in flight disables Place order and Check again", () => {
    const html = render(result(), {
      payment: { busy: "cod", message: null, onChoose: () => {} },
    })

    expect(isDisabled(placeButton(html))).toBe(true)
    expect(isDisabled(buttonLabelled(html, "Check again"))).toBe(true)
  })
})
