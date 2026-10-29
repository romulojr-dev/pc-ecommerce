import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import {
  type Build,
  buildStatus,
  checkBuild,
  estimateWattage,
} from "@/lib/builder"
import { buildA, nb, seed } from "@/test-support/seed-parts"

import { BuildSummary, type BuildSummaryProps } from "./build-summary"

// The summary's markup (docs/specs/020-builder-page, Behavior 15–16), from
// the real engine's output for seed builds

function propsFor(build: Build, total: number): BuildSummaryProps {
  const issues = checkBuild(build)
  return {
    state: "ready",
    isEmpty: Object.values(build).every((entries) => !entries?.length),
    total,
    power: estimateWattage(build),
    status: buildStatus(issues),
    issues,
    availability: null,
    onRetry: () => {},
    canShare: true,
    onShare: () => {},
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

  test("Add build to cart is disabled, and says why", () => {
    const html = render(propsFor(buildA(), 6_906_000))
    expect(html).toMatch(
      /<button[^>]*disabled[^>]*aria-describedby="build-cart-note"[^>]*>Add build to cart|<button[^>]*aria-describedby="build-cart-note"[^>]*disabled[^>]*>Add build to cart/
    )
    expect(html).toContain("Adding a whole build to the cart is coming soon.")
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
