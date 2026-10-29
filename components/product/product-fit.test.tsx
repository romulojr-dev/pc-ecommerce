import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import { ruleSpecsOf } from "@/lib/specs"
import { seed } from "@/test-support/seed-parts"

import { ProductFit, useProductFit } from "./product-fit"

// What Add to build and the fit block share
// (docs/specs/024-add-anyway-product-page, Behavior 4, 14)

const msi = seed.proB760mDdr4

function Probe() {
  const { status, fit } = useProductFit()
  return <p>{`${status}:${fit?.kind ?? "none"}`}</p>
}

describe("ProductFit", () => {
  test("with no provider there is no verdict and nothing to wait for", () => {
    expect(renderToStaticMarkup(<Probe />)).toBe("<p>ready:none</p>")
  })

  test("a product with no part to check adds as it always did", () => {
    expect(
      renderToStaticMarkup(
        <ProductFit part={null}>
          <Probe />
        </ProductFit>
      )
    ).toBe("<p>ready:none</p>")
  })

  test("on the server the build isn't read yet, so a click would wait", () => {
    const part = {
      id: msi.id,
      slot: msi.category,
      name: msi.name,
      ruleSpecs: ruleSpecsOf(msi.category, msi.specs),
    }
    expect(
      renderToStaticMarkup(
        <ProductFit part={part}>
          <Probe />
        </ProductFit>
      )
    ).toBe("<p>loading:none</p>")
  })
})
