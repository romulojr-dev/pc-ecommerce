import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import { flaggedCount } from "@/lib/cart/flags"
import type { CartLineView, CartView } from "@/lib/cart/types"

import { CartBody } from "./cart-body"
import { CartLine } from "./cart-line"

// docs/specs/025-cart-single-items, Behavior 17–25, E27, E29–E31: markup
// checks without a DOM

const ryzen: CartLineView = {
  kind: "single",
  id: "l1",
  productId: "p1",
  name: "AMD Ryzen 5 7600",
  slug: "amd-ryzen-5-7600",
  categorySlug: "cpu",
  brand: "AMD",
  image: null,
  price: 1_149_500,
  salePrice: null,
  unitPrice: 1_149_500,
  quantity: 2,
  lineTotal: 2_299_000,
  status: "in-stock",
  preorderShipsOn: null,
  sold: true,
  max: 12,
  flag: null,
  setTo: null,
}

const ryzen7600x: CartLineView = {
  ...ryzen,
  id: "l2",
  productId: "p2",
  name: "AMD Ryzen 5 7600X",
  slug: "amd-ryzen-5-7600x",
  price: 1_249_500,
  salePrice: 1_099_500,
  unitPrice: 1_099_500,
  quantity: 1,
  lineTotal: 1_099_500,
}

const retired: CartLineView = {
  ...ryzen,
  id: "l3",
  productId: "p3",
  name: "AMD Ryzen 7 5800X3D",
  slug: "amd-ryzen-7-5800x3d",
  quantity: 2,
  sold: false,
  max: 2,
  flag: { kind: "retired" },
}

const view = (lines: CartLineView[], subtotal: number, count: number) =>
  ({
    entries: lines,
    subtotal,
    count,
    flagged: flaggedCount(lines),
  }) satisfies CartView

type Props = Parameters<typeof CartBody>[0]
const render = (props: Partial<Props> & { view: CartView }) =>
  renderToStaticMarkup(
    <CartBody
      busy={new Set()}
      messages={{}}
      status=""
      onQuantity={() => {}}
      onSetTo={() => {}}
      onRemove={() => {}}
      onRemoveGroup={() => {}}
      {...props}
    />
  )

const isDisabled = (tag: string) => /\sdisabled(=""|[\s>])/.test(tag)

describe("a cart with lines (E27)", () => {
  const html = render({
    view: view([ryzen, ryzen7600x], 3_398_500, 3),
  })

  test("lists the lines in the order given", () => {
    expect(html.indexOf("AMD Ryzen 5 7600<")).toBeLessThan(
      html.indexOf("AMD Ryzen 5 7600X<")
    )
  })

  test("shows the subtotal and the count the header shows", () => {
    expect(html).toContain("Subtotal (3 items)")
    expect(html).toContain("₱33,985.00")
  })

  test("Checkout is a link to /checkout (spec 029, Behavior 1)", () => {
    expect(html).toMatch(/<a [^>]*href="\/checkout"[^>]*>Checkout<\/a>/)
    expect(html).not.toContain("coming soon")
    expect(html).toContain("Shipping and vouchers are calculated at checkout.")
  })

  test("is not the empty state", () => {
    expect(html).not.toContain("Your cart is empty")
  })
})

describe("Checkout while the cart can't be checked out (spec 029, N7)", () => {
  const html = render({
    view: view([{ ...ryzen, flag: { kind: "out-of-stock" } }], 2_299_000, 2),
  })

  test("is disabled and says why in visible text", () => {
    const checkout = /<button[^>]*>Checkout<\/button>/.exec(html)?.[0] ?? ""
    expect(isDisabled(checkout)).toBe(true)
    expect(checkout).toContain('aria-describedby="checkout-blocked"')
    expect(html).toContain(
      ">Fix or remove the lines marked above to check out.<"
    )
    expect(html).not.toMatch(/<a [^>]*href="\/checkout"/)
  })
})

describe("an empty cart (E29)", () => {
  const html = render({ view: view([], 0, 0) })

  test("says so and offers the way back", () => {
    expect(html).toContain("Your cart is empty")
    expect(html).toContain(
      "Add parts from a product page, or plan a whole PC in the builder."
    )
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*>Browse the home page<\/a>/)
    expect(html).toMatch(
      /<a [^>]*href="\/builder"[^>]*>Open the PC Builder<\/a>/
    )
  })

  test("has no summary and no Checkout button", () => {
    expect(html).not.toContain("Checkout")
    expect(html).not.toContain("Subtotal")
  })

  test("the heading can take focus after the last line is removed", () => {
    expect(html).toMatch(/<h2 id="cart-empty-heading" tabindex="-1"/)
  })
})

describe("the status region", () => {
  test("is in the page before anything is said", () => {
    expect(render({ view: view([], 0, 0) })).toContain('<p role="status"')
  })

  test("shows what was announced", () => {
    const html = render({
      view: view([], 0, 0),
      status: "Removed AMD Ryzen 5 7600 from your cart.",
    })
    expect(html).toContain("Removed AMD Ryzen 5 7600 from your cart.")
  })
})

describe("a part that is no longer sold (E31)", () => {
  const html = render({ view: view([ryzen, retired], 2_299_000, 4) })

  test("stays as a line with nothing to buy", () => {
    expect(html).toContain("No longer sold")
    expect(html).toContain("Not included in the subtotal.")
    expect(html).not.toContain('href="/cpu/amd-ryzen-7-5800x3d"')
    expect(html).toContain('aria-label="Remove AMD Ryzen 7 5800X3D"')
  })

  test("has no stepper, and its price and line total are out", () => {
    expect(html).not.toContain("Quantity of AMD Ryzen 7 5800X3D")
    expect(html).not.toContain("Increase quantity of AMD Ryzen 7 5800X3D")
  })

  test("the subtotal leaves it out; the count keeps it", () => {
    expect(html).toContain("Subtotal (4 items)")
    expect(html).toContain("₱22,990.00")
  })
})

describe("a line", () => {
  const line = (props: Partial<Parameters<typeof CartLine>[0]> = {}) =>
    renderToStaticMarkup(
      <CartLine
        line={ryzen}
        busy={false}
        message={null}
        onQuantity={() => {}}
        onSetTo={() => {}}
        onRemove={() => {}}
        {...props}
      />
    )

  test("shows the image box, brand, linked name, price, total and stock", () => {
    const html = line()
    expect(html).toContain(
      'aria-label="No image available for AMD Ryzen 5 7600"'
    )
    expect(html).toContain(">AMD<")
    expect(html).toMatch(
      /<a [^>]*href="\/cpu\/amd-ryzen-5-7600"[^>]*>AMD Ryzen 5 7600<\/a>/
    )
    expect(html).toContain("₱11,495.00")
    expect(html).toContain("₱22,990.00")
    expect(html).toContain("In stock")
  })

  test("a sale shows the price paid, with the regular price struck through", () => {
    const html = line({ line: ryzen7600x })
    expect(html).toContain("₱10,995.00")
    expect(html).toContain("<s>₱12,495.00</s>")
    expect(html).toContain("Was ")
  })

  test("E30: low stock says so", () => {
    expect(line({ line: { ...ryzen, status: "low-stock" } })).toContain(
      "Low stock"
    )
  })

  test("the stepper and Remove are named for the part", () => {
    const html = line()
    expect(html).toContain('aria-label="Decrease quantity of AMD Ryzen 5 7600"')
    expect(html).toContain('aria-label="Quantity of AMD Ryzen 5 7600"')
    expect(html).toContain('aria-label="Increase quantity of AMD Ryzen 5 7600"')
    expect(html).toContain('aria-label="Remove AMD Ryzen 5 7600"')
  })

  test("plus is disabled at the most the line can hold", () => {
    const plus = (html: string) =>
      /<button[^>]*aria-label="Increase quantity[^"]*"[^>]*>/.exec(html)?.[0] ??
      ""
    expect(isDisabled(plus(line()))).toBe(false)
    expect(isDisabled(plus(line({ line: { ...ryzen, max: 2 } })))).toBe(true)
  })

  test("minus is disabled at 1", () => {
    const minus = (html: string) =>
      /<button[^>]*aria-label="Decrease quantity[^"]*"[^>]*>/.exec(html)?.[0] ??
      ""
    expect(isDisabled(minus(line({ line: { ...ryzen, quantity: 1 } })))).toBe(
      true
    )
  })

  test("a change in progress disables the line's controls and marks it busy", () => {
    const html = line({ busy: true })
    expect(html).toContain('aria-busy="true"')
    for (const label of ["Decrease", "Increase"]) {
      const button = new RegExp(
        `<button[^>]*aria-label="${label} quantity[^"]*"[^>]*>`
      )
      expect(isDisabled(button.exec(html)?.[0] ?? "")).toBe(true)
    }
    const remove = /<button[^>]*aria-label="Remove [^"]*"[^>]*>/.exec(html)?.[0]
    expect(isDisabled(remove ?? "")).toBe(true)
  })

  test("a stock note is a status; a failure is an alert", () => {
    expect(
      line({
        message: {
          kind: "note",
          text: "Only 2 in stock. You have 2 in your cart.",
        },
      })
    ).toMatch(
      /<p role="status"[^>]*>Only 2 in stock\. You have 2 in your cart\.<\/p>/
    )
    expect(
      line({
        message: {
          kind: "error",
          text: "Couldn't update your cart. Try again.",
        },
      })
    ).toMatch(
      /<p role="alert"[^>]*>Couldn&#x27;t update your cart\. Try again\.<\/p>/
    )
  })
})

// docs/specs/027-cart-stock-flags, Behavior 5–9: a single line's flag
describe("a flagged line", () => {
  const line = (
    props: Partial<CartLineView>,
    extra: Partial<Parameters<typeof CartLine>[0]> = {}
  ) =>
    renderToStaticMarkup(
      <CartLine
        line={{ ...ryzen, ...props }}
        busy={false}
        message={null}
        onQuantity={() => {}}
        onSetTo={() => {}}
        onRemove={() => {}}
        {...extra}
      />
    )

  const over = { kind: "over-stock", stock: 2, total: 3 } as const
  const button = (html: string) =>
    /<button[^>]*aria-label="Set [^"]*"[^>]*>[^<]*<\/button>/.exec(html)?.[0] ??
    ""
  const plus = (html: string) =>
    /<button[^>]*aria-label="Increase quantity[^"]*"[^>]*>/.exec(html)?.[0] ??
    ""

  test("E1, E5: over stock names the stock and the cart, and offers Set to", () => {
    const html = line({ flag: over, setTo: 1, max: 2 })
    expect(html).toContain("Only 2 in stock, 3 in your cart")
    expect(html).toContain("In stock")
    expect(button(html)).toContain('aria-label="Set AMD Ryzen 5 7600 to 1"')
    expect(button(html)).toContain(">Set to 1<")
  })

  test("E6: when no quantity helps there is the flag and no button", () => {
    const html = line({ flag: over, setTo: null, max: 2 })
    expect(html).toContain("Only 2 in stock, 3 in your cart")
    expect(button(html)).toBe("")
    expect(html).toContain('aria-label="Remove AMD Ryzen 5 7600"')
  })

  test("Set to is disabled while a change runs", () => {
    expect(
      isDisabled(button(line({ flag: over, setTo: 1 }, { busy: true })))
    ).toBe(true)
    expect(isDisabled(button(line({ flag: over, setTo: 1 })))).toBe(false)
  })

  test("E10: out of stock is the label, in place of the stock line", () => {
    const html = line({
      flag: { kind: "out-of-stock" },
      status: "out-of-stock",
      max: 2,
    })
    expect(html.match(/Out of stock/g)).toHaveLength(1)
    expect(html).toContain("₱11,495.00")
    expect(html).toContain("₱22,990.00")
    expect(html).toContain('aria-label="Remove AMD Ryzen 5 7600"')
    expect(isDisabled(plus(html))).toBe(true)
    expect(button(html)).toBe("")
  })

  test("E11: a pre-order says so and when it ships", () => {
    const html = line({
      flag: { kind: "pre-order" },
      status: "pre-order",
      preorderShipsOn: "2027-02-01",
      max: 2,
    })
    expect(html).toContain("Pre-order only")
    expect(html).toContain("Ships February 1, 2027")
    expect(html).not.toContain("Pre-order: ships")
    expect(isDisabled(plus(html))).toBe(true)
  })

  test("E12: no longer sold is shown once, as before", () => {
    const html = line({
      flag: { kind: "retired" },
      sold: false,
      max: 2,
    })
    expect(html.match(/No longer sold/g)).toHaveLength(1)
    expect(html).toContain("Not included in the subtotal.")
  })

  test("the three unavailable labels share one style", () => {
    const style = (flag: CartLineView["flag"]) =>
      /<p class="([^"]*text-destructive[^"]*)"[^>]*><svg/.exec(
        line({ flag, max: 2 })
      )?.[1]
    expect(style({ kind: "out-of-stock" })).toBe(style({ kind: "pre-order" }))
    expect(style({ kind: "out-of-stock" })).toBeDefined()
  })

  test("a clean line has no flag", () => {
    const html = line({})
    expect(html).not.toContain("Only ")
    expect(html).not.toContain("Set to")
  })

  test("the quantity field has an id, for focus after Set to", () => {
    expect(line({ flag: over, setTo: 1 })).toContain('id="quantity-l1"')
  })
})

// docs/specs/027-cart-stock-flags, Behavior 14–15: the banner
describe("the banner", () => {
  const over = { kind: "over-stock", stock: 2, total: 3 } as const
  const flaggedLine = (
    id: string,
    flag: CartLineView["flag"]
  ): CartLineView => ({
    ...ryzen,
    id,
    productId: `p-${id}`,
    flag,
    setTo: null,
  })

  test("E1: counts the flagged lines", () => {
    const html = render({
      view: view(
        [flaggedLine("a", over), flaggedLine("b", over), ryzen7600x],
        0,
        4
      ),
    })
    expect(html).toContain(
      "2 lines need attention. Fix or remove them before you check out."
    )
  })

  test("E3, E10: one line", () => {
    const html = render({
      view: view([flaggedLine("a", { kind: "out-of-stock" })], 0, 2),
    })
    expect(html).toContain(
      "1 line needs attention. Fix or remove it before you check out."
    )
  })

  test("the three unavailable labels get the same banner", () => {
    const text = (flag: CartLineView["flag"]) =>
      /\d lines? needs? attention[^<]*/.exec(
        render({ view: view([flaggedLine("a", flag)], 0, 2) })
      )?.[0]
    expect(text({ kind: "retired" })).toBeDefined()
    expect(text({ kind: "retired" })).toBe(text({ kind: "out-of-stock" }))
    expect(text({ kind: "pre-order" })).toBe(text({ kind: "out-of-stock" }))
  })

  test("E18: nothing flagged, no banner; the live region is already there", () => {
    const html = render({ view: view([ryzen, ryzen7600x], 3_398_500, 3) })
    expect(html).not.toContain("need attention")
    expect(html).not.toContain("needs attention")
    expect(html).toContain('<div aria-live="polite"></div>')
  })

  test("E19: an empty cart has none", () => {
    expect(render({ view: view([], 0, 0) })).not.toContain("attention")
  })

  test("it is a live region, and the page keeps its one status role", () => {
    const html = render({ view: view([flaggedLine("a", over)], 0, 2) })
    expect(html).toMatch(/<div aria-live="polite"><p[^>]*>.*1 line needs/)
    expect(html.match(/role="status"/g)).toHaveLength(1)
  })
})
