import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { voucherRefusalText } from "@/lib/checkout/copy"

import {
  idleVoucherBox,
  VOUCHER_INPUT_ID,
  VOUCHER_REMOVE_ID,
  VoucherBox,
  type VoucherBoxState,
} from "./voucher-box"

// docs/specs/037-vouchers-at-checkout: O4–O7, the box as markup

const render = (
  applied: string | null,
  state: Partial<VoucherBoxState> = {},
  disabled = false
) =>
  renderToStaticMarkup(
    <VoucherBox
      applied={applied}
      disabled={disabled}
      state={{ ...idleVoucherBox, ...state }}
    />
  )

const isDisabled = (tag: string) => /\sdisabled(?:=""|\s|>)/.test(tag)
const inputTag = (html: string) =>
  html.slice(html.indexOf("<input"), html.indexOf(">", html.indexOf("<input")))

describe("the idle box", () => {
  it("has a labelled field, Apply and an empty polite message region", () => {
    const html = render(null)
    expect(html).toContain(`for="${VOUCHER_INPUT_ID}"`)
    expect(html).toContain(">Voucher code</label>")
    expect(html).toContain(`id="${VOUCHER_INPUT_ID}"`)
    expect(html).toContain('maxLength="32"')
    expect(html).toContain(">Apply</button>")
    expect(html).toMatch(/<p id="checkout-voucher-message" aria-live="polite"/)
    // (the class list has "aria-invalid:" variants, so look for the attribute)
    expect(inputTag(html)).not.toMatch(/\saria-invalid=/)
  })

  it("O5: a refusal is in the polite region, tied to the field, and marks it invalid", () => {
    const html = render(null, {
      text: "NOPE",
      message: "That code has ended.",
    })
    const input = inputTag(html)
    expect(input).toContain('value="NOPE"')
    expect(input).toContain('aria-invalid="true"')
    expect(input).toContain('aria-describedby="checkout-voucher-message"')
    expect(html).toMatch(
      /id="checkout-voucher-message"[^>]*aria-live="polite"[^>]*>That code has ended\.<\/p>/
    )
    expect(html).not.toContain('role="status"')
  })

  it("O6: the empty-submit message is announced the same way", () => {
    const html = render(null, { message: "Enter a code." })
    expect(html).toContain(">Enter a code.</p>")
  })

  it("O7: the below-minimum text names the floor", () => {
    const html = render(null, {
      message: voucherRefusalText({ reason: "below-minimum" }),
    })
    expect(html).toContain("below ₱20.00")
  })

  it("is busy and locked while applying", () => {
    const html = render(null, { busy: "apply", text: "WELCOME10" })
    expect(html).toContain(">Checking…</button>")
    expect(html).toContain('aria-busy="true"')
    expect(isDisabled(inputTag(html))).toBe(true)
  })

  it("is locked while an order is being placed", () => {
    const html = render(null, {}, true)
    expect(isDisabled(inputTag(html))).toBe(true)
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Apply<\/button>/)
  })

  it("turns off autocomplete and spellcheck", () => {
    const input = inputTag(render(null))
    expect(input).toContain('autoComplete="off"')
    expect(input).toContain('spellCheck="false"')
  })
})

describe("the applied box", () => {
  it("shows the code and Remove, with an id focus can find", () => {
    const html = render("WELCOME10")
    expect(html).toContain("WELCOME10 applied")
    expect(html).toContain(`id="${VOUCHER_REMOVE_ID}"`)
    expect(html).toContain(">Remove</button>")
    expect(html).not.toContain("<input")
  })

  it("is busy while removing", () => {
    const html = render("WELCOME10", { busy: "remove" })
    expect(html).toContain(">Removing…</button>")
    expect(html).toContain('aria-busy="true"')
  })

  it("shows a failed Remove's message", () => {
    const html = render("WELCOME10", { message: "Try again soon." })
    expect(html).toContain(">Try again soon.</p>")
  })
})
