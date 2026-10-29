import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import type { BuildPart } from "@/lib/builder"
import { type Fit, fitOf, type FitPart } from "@/lib/build-state/fit"
import { ruleSpecsOf } from "@/lib/specs"
import { buildA, seed, seedPart } from "@/test-support/seed-parts"

import { FitBlock, FitWithBuild } from "./fit-with-build"
import { ProductFit } from "./product-fit"

// The product page's block (docs/specs/023-fits-your-build-hints, Behavior
// 10–12; E27–E29)

const partOf = (part: BuildPart): FitPart => ({
  id: part.id,
  slot: part.category,
  name: part.name,
  ruleSpecs: ruleSpecsOf(part.category, part.specs),
})

const render = (fit: Fit | null) => renderToStaticMarkup(<FitBlock fit={fit} />)

describe("FitBlock", () => {
  test("is named for assistive technology and is not a live region (Behavior 11)", () => {
    const html = render({ kind: "fits" })
    expect(html).toContain('aria-label="Fit with your build"')
    expect(html).not.toMatch(/aria-live|role="status"|role="alert"/)
  })

  test("reserves the label's line and shows nothing before the build loads", () => {
    const html = render(null)
    expect(html).toContain('<div class="min-h-5 leading-5"></div>')
    expect(html).not.toContain("<ul")
    expect(html).not.toContain("build</span>")
  })

  test("a part that fits or is in the build shows the label only (E29)", () => {
    for (const [fit, label] of [
      [{ kind: "fits" }, "Fits your build"],
      [{ kind: "in-build" }, "In your build"],
    ] as const) {
      const html = render(fit)
      expect(html).toContain(label)
      expect(html).not.toContain("<ul")
    }
  })

  test("a part that doesn't fit lists its errors, marked Error (E27)", () => {
    const html = render(fitOf(buildA(), partOf(seed.proB760mDdr4)))
    expect(html).toContain("Doesn&#x27;t fit your build")
    expect(html.match(/Error:/g)).toHaveLength(2)
    expect(html).not.toContain("Warning:")
    expect(html.indexOf("socket")).toBeLessThan(html.indexOf("DDR5 memory"))
  })

  test("a warning is marked Warning (E28)", () => {
    const html = render(
      fitOf(buildA(), {
        id: seed.ryzen7_9800x3d.id,
        slot: "cpu",
        name: seed.ryzen7_9800x3d.name,
        ruleSpecs: ruleSpecsOf("cpu", seed.ryzen7_9800x3d.specs),
      })
    )
    expect(html).toContain("Fits, with warnings")
    expect(html).toContain("Warning:")
    expect(html).toContain("may need a BIOS update")
  })

  test("errors come before warnings (E7)", () => {
    const html = render(fitOf(buildA(), partOf(seedPart("cpu", "BX80768265K"))))
    expect(html).toContain("Doesn&#x27;t fit your build")
    expect(html.match(/Error:/g)).toHaveLength(1)
    expect(html.match(/Warning:/g)).toHaveLength(1)
    expect(html.indexOf("Error:")).toBeLessThan(html.indexOf("Warning:"))
  })
})

describe("FitWithBuild", () => {
  test("renders only the reserved line on the server, whatever the saved build", () => {
    const html = renderToStaticMarkup(
      <ProductFit part={partOf(seed.proB760mDdr4)}>
        <FitWithBuild />
      </ProductFit>
    )
    expect(html).toContain('<div class="min-h-5 leading-5"></div>')
    expect(html).not.toContain("Fits")
  })
})
