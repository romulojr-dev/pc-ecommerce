import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import { PURCHASE_NOTE_ID, PurchaseView } from "./purchase-view"

// docs/specs/025-cart-single-items, Behavior 7–10, D9, D13, E37: markup
// checks without a DOM
type Props = Parameters<typeof PurchaseView>[0]

function render(overrides: Partial<Props> = {}) {
  return renderToStaticMarkup(
    <PurchaseView
      text="1"
      onTextChange={() => {}}
      max={12}
      buyable
      builderPart
      pending={false}
      outcome={null}
      onAdd={() => {}}
      addToBuild={<button>Add to build</button>}
      {...overrides}
    />
  )
}

// The attribute, not the `disabled:` classes Tailwind puts on the same tag
const isDisabled = (tag: string) => /\sdisabled(=""|[\s>])/.test(tag)

const quantityField = (html: string) => /<input[^>]*>/.exec(html)?.[0] ?? ""

const cartButton = (html: string) =>
  /<button[^>]*>(?:Add to cart|Adding…)<\/button>/.exec(html)?.[0] ?? ""

describe("a part that can be bought", () => {
  test("Add to cart is enabled and says nothing is wrong", () => {
    const html = render()
    expect(isDisabled(cartButton(html))).toBe(false)
    expect(cartButton(html)).not.toContain("aria-describedby")
    expect(html).not.toContain(PURCHASE_NOTE_ID)
    expect(html).not.toContain("Cart is coming soon")
  })

  test("the quantity field is enabled and holds its text", () => {
    const html = render({ text: "2" })
    expect(quantityField(html)).toContain('value="2"')
    expect(isDisabled(quantityField(html))).toBe(false)
  })

  test("Add to build comes after Add to cart", () => {
    const html = render()
    expect(html.indexOf("Add to cart")).toBeLessThan(
      html.indexOf("Add to build")
    )
  })

  test("the status region is there before anything is said", () => {
    expect(render()).toContain('role="status"')
  })
})

describe("a part that can't be bought (E37)", () => {
  test("Add to cart and the quantity are disabled, with one visible reason", () => {
    const html = render({ buyable: false })
    expect(isDisabled(cartButton(html))).toBe(true)
    expect(cartButton(html)).toContain(`aria-describedby="${PURCHASE_NOTE_ID}"`)
    expect(isDisabled(quantityField(html))).toBe(true)
    expect(html).toContain(
      `<p id="${PURCHASE_NOTE_ID}" class="text-sm text-muted-foreground">Only parts in stock can be added to your cart or build.</p>`
    )
  })

  test("outside the builder categories the note names the cart only", () => {
    const html = render({ buyable: false, builderPart: false })
    expect(html).toContain("Only parts in stock can be added to your cart.<")
    expect(html).not.toContain("or build")
  })
})

describe("adding", () => {
  test("shows Adding… and is busy and disabled", () => {
    const button = cartButton(render({ pending: true }))
    expect(button).toContain("Adding…")
    expect(button).toContain('aria-busy="true"')
    expect(isDisabled(button)).toBe(true)
  })

  test("says what was added, with a link to the cart", () => {
    const html = render({
      outcome: { kind: "added", lines: ["Added to your cart."] },
    })
    expect(html).toContain("<p>Added to your cart.</p>")
    expect(html).toMatch(/<a [^>]*href="\/cart"[^>]*>View cart<\/a>/)
  })

  test("a capped add names the cap", () => {
    const html = render({
      outcome: {
        kind: "added",
        lines: [
          "Added 2 to your cart.",
          "Only 5 in stock. You have 5 in your cart.",
        ],
      },
    })
    expect(html).toContain("<p>Added 2 to your cart.</p>")
    expect(html).toContain("<p>Only 5 in stock. You have 5 in your cart.</p>")
  })

  test("a part that just stopped being buyable says so", () => {
    const html = render({ outcome: { kind: "unavailable" } })
    expect(html).toContain("This part can&#x27;t be bought right now.")
    expect(html).not.toContain("View cart")
  })

  test("an error is an alert", () => {
    const html = render({ outcome: { kind: "error" } })
    expect(html).toMatch(
      /<p role="alert"[^>]*>Couldn&#x27;t add this to your cart\. Try again\.<\/p>/
    )
  })
})
