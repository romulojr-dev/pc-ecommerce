import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import { checkBuild } from "@/lib/builder"
import { buildB, seed, swap } from "@/test-support/seed-parts"

import { WarningsList } from "./warnings-dialog"

// docs/specs/026-add-build-to-cart, Behavior 6, E46: Build B′ has two
// warnings, a PSU one and a BIOS one
describe("WarningsList", () => {
  test("lists every warning message, in the engine's order", () => {
    const warnings = checkBuild(swap(buildB(), seed.mwe550))
    const html = renderToStaticMarkup(<WarningsList warnings={warnings} />)

    expect(warnings).toHaveLength(2)
    expect(html.match(/<li>/g)).toHaveLength(2)
    expect(html.indexOf("need an estimated")).toBeGreaterThan(-1)
    expect(html.indexOf("need an estimated")).toBeLessThan(
      html.indexOf("may need a BIOS update")
    )
  })
})
