import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { CheckoutReview } from "@/lib/checkout/review"
import type { ReviewProblem } from "@/lib/checkout/problems"

import { type ReviewOk, ReviewView } from "./review-view"

// docs/specs/030-place-an-order: Z1 and Place order's states, as markup

function result(
  options: {
    ordersEnabled?: boolean
    problems?: ReviewProblem[]
    holdHours?: number
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
      total: 2_299_000,
      threshold: null,
      problems,
      warnings: [],
      canPlace: problems.length === 0,
    } as unknown as CheckoutReview,
  }
}

const render = (r: ReviewOk, props: { placing?: boolean } = {}): string =>
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
