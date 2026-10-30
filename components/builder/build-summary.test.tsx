import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import {
  type Build,
  buildStatus,
  checkBuild,
  estimateWattage,
} from "@/lib/builder"
import { buildCartButton } from "@/lib/build-state/cart-button"
import { buildA, nb, seed } from "@/test-support/seed-parts"

import { BuildSummary, type BuildSummaryProps } from "./build-summary"

// The summary's markup (docs/specs/020-builder-page, Behavior 15–16), from
// the real engine's output for seed builds

function propsFor(build: Build, total: number): BuildSummaryProps {
  const issues = checkBuild(build)
  const isEmpty = Object.values(build).every((entries) => !entries?.length)
  const status = buildStatus(issues)
  return {
    state: "ready",
    isEmpty,
    total,
    power: estimateWattage(build),
    status,
    issues,
    availability: null,
    onRetry: () => {},
    canShare: true,
    onShare: () => {},
    cart: {
      button: buildCartButton({
        state: "ready",
        isEmpty,
        status,
        hasUnavailable: false,
      }),
      sending: false,
      result: null,
      onClick: () => {},
    },
  }
}

const render = (props: BuildSummaryProps) =>
  renderToStaticMarkup(<BuildSummary {...props} />)

const text = (html: string) => html.replace(/<[^>]+>/g, " ")

describe("BuildSummary", () => {
  test("an empty build has no status, only an invitation (E1)", () => {
    const html = render(propsFor({}, 0))
    expect(html).toContain("₱0.00")
    expect(html).toContain(nb("Estimated power: 0 W"))
    expect(html).toContain("Add parts to check compatibility.")
    expect(html).not.toContain("Compatibility:")
  })

  test("before a PSU, the estimate has no percentage (E2)", () => {
    const build = { cpu: [{ part: seed.ryzen5_7600, quantity: 1 }] }
    const html = render(propsFor(build, 1_149_500))
    expect(html).toContain("₱11,495.00")
    expect(html).toContain(nb("Estimated power: 114 W"))
    expect(text(html)).toContain("OK")
    expect(html).toContain("No compatibility issues found.")
  })

  test("with a PSU, the estimate is measured against it (E3)", () => {
    const html = render(propsFor(buildA(), 6_906_000))
    expect(html).toContain("₱69,060.00")
    expect(html).toContain(
      `Estimated power: ${nb("264 W")} of ${nb("550 W")} (48%)`
    )
  })

  test("shows a warning in plain language (E5)", () => {
    const build = { cpu: [{ part: seed.i5_14400f, quantity: 1 }] }
    const html = render(propsFor(build, 929_500))
    expect(text(html)).toContain("Warnings")
    expect(html).toContain(
      "The Intel Core i5-14400F has no integrated graphics, so add a graphics card to get a display."
    )
  })

  test("lists errors before warnings (E6)", () => {
    const build = {
      cpu: [{ part: seed.i5_14400f, quantity: 1 }],
      motherboard: [{ part: seed.strixB650a, quantity: 1 }],
    }
    const html = render(propsFor(build, 0))
    expect(text(html)).toContain("Errors")
    const socket = html.indexOf("doesn&#x27;t fit")
    const graphics = html.indexOf("no integrated graphics")
    expect(socket).toBeGreaterThan(-1)
    expect(graphics).toBeGreaterThan(socket)
  })

  test("says when a part can't be bought (E7)", () => {
    const html = render({
      ...propsFor(buildA(), 6_906_000),
      availability: "The X isn't available to buy right now.",
    })
    expect(html).toContain("The X isn&#x27;t available to buy right now.")
  })

  test("shows no figure while loading", () => {
    const html = render({ ...propsFor(buildA(), 6_906_000), state: "loading" })
    expect(html).not.toContain("₱")
    expect(html).not.toContain("Estimated power")
    expect(html).not.toContain("Compatibility:")
  })

  test("offers to try again when loading failed (E54)", () => {
    const html = render({ ...propsFor(buildA(), 6_906_000), state: "error" })
    expect(html).toContain('role="alert"')
    expect(html).toContain("We couldn’t load your build’s prices and stock.")
    expect(html).toContain("Try again")
    expect(html).not.toContain("₱")
  })

  describe("Add build to cart (docs/specs/026-add-build-to-cart, Behavior 1–5; E40–E45)", () => {
    const cartButton = /<button[^>]*>(Add build to cart|Adding…)<\/button>/
    // The disabled attribute, not Tailwind's "disabled:" classes
    const isDisabled = (button: string) => /\sdisabled(=|\s|>)/.test(button)
    const errorsBuild = {
      cpu: [{ part: seed.i5_14400f, quantity: 1 }],
      motherboard: [{ part: seed.strixB650a, quantity: 1 }],
    }

    test("E44: is enabled for a compatible build, with no note", () => {
      const html = render(propsFor(buildA(), 6_906_000))
      const button = html.match(cartButton)![0]
      expect(isDisabled(button)).toBe(false)
      expect(button).not.toContain("aria-describedby")
      expect(html).not.toContain("coming soon")
      expect(html).not.toContain("build-cart-note")
    })

    test("is enabled with warnings: the click asks first", () => {
      const build = { cpu: [{ part: seed.i5_14400f, quantity: 1 }] }
      const html = render(propsFor(build, 929_500))
      expect(isDisabled(html.match(cartButton)![0])).toBe(false)
    })

    test("E40: an empty build says to add parts", () => {
      const html = render(propsFor({}, 0))
      const button = html.match(cartButton)![0]
      expect(isDisabled(button)).toBe(true)
      expect(button).toContain('aria-describedby="build-cart-note-empty"')
      expect(html).toContain('id="build-cart-note-empty"')
      expect(html).toContain("Add parts to add your build to cart.")
    })

    test.each(["loading", "error"] as const)(
      "E41: %s → disabled, with no note",
      (state) => {
        const props = propsFor(buildA(), 6_906_000)
        const html = render({
          ...props,
          state,
          cart: { ...props.cart, button: { enabled: false, reasons: [] } },
        })
        const button = html.match(cartButton)![0]
        expect(isDisabled(button)).toBe(true)
        expect(button).not.toContain("aria-describedby")
        expect(html).not.toContain("build-cart-note")
      }
    )

    test("E42: errors say to fix them", () => {
      const html = render(propsFor(errorsBuild, 0))
      const button = html.match(cartButton)![0]
      expect(isDisabled(button)).toBe(true)
      expect(button).toContain('aria-describedby="build-cart-note-errors"')
      expect(html).toContain("Fix the errors to add this build to cart.")
    })

    test("E43: a part that can't be bought points at the availability line", () => {
      const props = propsFor(buildA(), 6_906_000)
      const html = render({
        ...props,
        availability:
          "The ASUS Dual GeForce RTX 4060 OC Edition 8GB isn’t available to buy right now. Replace it to add this build to cart.",
        cart: {
          ...props.cart,
          button: { enabled: false, reasons: ["unavailable"] },
        },
      })
      const button = html.match(cartButton)![0]
      expect(isDisabled(button)).toBe(true)
      expect(button).toContain('aria-describedby="build-availability"')
      expect(html).toContain('id="build-availability"')
      // No second sentence: the availability line is the reason
      expect(html).not.toContain("build-cart-note")
    })

    test("errors and unavailable parts point at both, errors first", () => {
      const props = propsFor(errorsBuild, 0)
      const html = render({
        ...props,
        availability: "The X isn’t available to buy right now.",
        cart: {
          ...props.cart,
          button: { enabled: false, reasons: ["errors", "unavailable"] },
        },
      })
      expect(html.match(cartButton)![0]).toContain(
        'aria-describedby="build-cart-note-errors build-availability"'
      )
    })

    test("while sending: Adding…, busy and disabled", () => {
      const props = propsFor(buildA(), 6_906_000)
      const html = render({ ...props, cart: { ...props.cart, sending: true } })
      const button = html.match(cartButton)![0]
      expect(button).toContain("Adding…")
      expect(button).toContain('aria-busy="true"')
      expect(isDisabled(button)).toBe(true)
    })

    test("the result region is always in the page, and isn't a status role", () => {
      const html = render(propsFor(buildA(), 6_906_000))
      expect(html).toContain('aria-live="polite"')
      expect(html).not.toContain('role="status"')
    })

    test("E44: added shows the line and View cart", () => {
      const props = propsFor(buildA(), 6_906_000)
      const html = render({
        ...props,
        cart: {
          ...props.cart,
          result: { kind: "success", text: "Added your build to your cart." },
        },
      })
      expect(html).toContain("Added your build to your cart.")
      expect(html).toMatch(/<a[^>]*href="\/cart"[^>]*>View cart<\/a>/)
    })

    test("E48: a refusal is an alert with its lead and lines", () => {
      const props = propsFor(buildA(), 6_906_000)
      const html = render({
        ...props,
        cart: {
          ...props.cart,
          result: {
            kind: "alert",
            lead: "This build can’t be added to your cart:",
            lines: ["Not enough stock for AMD Ryzen 5 7600: 1 in stock."],
          },
        },
      })
      expect(html).toContain('role="alert"')
      expect(html).toContain("This build can’t be added to your cart:")
      expect(html).toContain("Not enough stock for AMD Ryzen 5 7600")
      expect(html).not.toContain("View cart")
    })
  })

  describe("Share build (docs/specs/022-share-build, Behavior 1; E39, E44)", () => {
    const shareButton = /<button[^>]*>Share build<\/button>/
    // The disabled attribute, not Tailwind's "disabled:" classes
    const isDisabled = (button: string) => /\sdisabled(=|\s|>)/.test(button)

    test("is enabled for a build that has loaded", () => {
      const html = render(propsFor(buildA(), 6_906_000))
      const button = html.match(shareButton)![0]
      expect(isDisabled(button)).toBe(false)
      expect(html).not.toContain("Add parts to share your build.")
    })

    test("is disabled for an empty build, and says why", () => {
      const html = render({ ...propsFor({}, 0), canShare: false })
      const button = html.match(shareButton)![0]
      expect(isDisabled(button)).toBe(true)
      expect(button).toContain('aria-describedby="build-share-note"')
      expect(html).toContain('id="build-share-note"')
      expect(html).toContain("Add parts to share your build.")
    })

    test.each(["loading", "error"] as const)(
      "is disabled, without a note, while %s",
      (state) => {
        const html = render({
          ...propsFor(buildA(), 6_906_000),
          state,
          canShare: false,
        })
        const button = html.match(shareButton)![0]
        expect(isDisabled(button)).toBe(true)
        expect(button).not.toContain("aria-describedby")
        expect(html).not.toContain("Add parts to share your build.")
      }
    )
  })
})
