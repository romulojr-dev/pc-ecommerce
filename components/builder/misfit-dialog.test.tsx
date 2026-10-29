import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import { fitOf } from "@/lib/build-state/fit"
import { replaceNote } from "@/lib/build-state/add-decision"
import { ruleSpecsOf } from "@/lib/specs"
import { buildA, seed } from "@/test-support/seed-parts"

import { MisfitDetails } from "./misfit-dialog"

// The confirmation's body (docs/specs/024-add-anyway-product-page, Behavior
// 10–11; E1, E4, E5)

const msi = seed.proB760mDdr4
const fit = fitOf(buildA(), {
  id: msi.id,
  slot: msi.category,
  name: msi.name,
  ruleSpecs: ruleSpecsOf(msi.category, msi.specs),
})
const errors = fit.kind === "errors" ? fit.issues : []

const render = (note?: string) =>
  renderToStaticMarkup(<MisfitDetails errors={errors} note={note} />)

describe("MisfitDetails", () => {
  test("lists every error in the engine's order (E1)", () => {
    const html = render()
    const socket = html.indexOf("doesn&#x27;t fit the LGA1700 socket")
    const memory = html.indexOf("takes DDR4.")
    expect(socket).toBeGreaterThan(-1)
    expect(memory).toBeGreaterThan(socket)
    expect(html.match(/<li>/g)).toHaveLength(2)
  })

  test("says the build can't go to the cart until this is fixed", () => {
    expect(render()).toContain(
      "You can still add it, but you can&#x27;t add the build to your cart until this is fixed."
    )
  })

  test("with nothing to replace there is no replace sentence (E4)", () => {
    expect(render()).not.toContain("also replaces")
  })

  test("the replace sentence comes after the errors and before the cart line (E1, E5)", () => {
    const html = render(replaceNote("motherboard", 1))
    const list = html.indexOf("</ul>")
    const note = html.indexOf("This also replaces the motherboard you picked.")
    const cart = html.indexOf("You can still add it")
    expect(list).toBeGreaterThan(-1)
    expect(note).toBeGreaterThan(list)
    expect(cart).toBeGreaterThan(note)
  })
})
