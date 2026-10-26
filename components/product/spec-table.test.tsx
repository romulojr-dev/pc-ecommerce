import { renderToStaticMarkup } from "react-dom/server"
import { assert, expect, test } from "vitest"

import { validateSpecs } from "@/lib/specs"
import { motherboards } from "@/prisma/seed/data/motherboards"

import { SpecTable } from "./spec-table"

// Markup check without a DOM: semantics only, the look is checked by hand
// (docs/specs/009-spec-table, "Tests")
test("renders a seeded motherboard as an accessible, grouped table", () => {
  const result = validateSpecs("motherboard", motherboards[0].specs)
  if (!result.success) assert.fail("seed motherboard specs are invalid")

  const html = renderToStaticMarkup(
    <SpecTable category="motherboard" specs={result.data} />
  )

  expect(html).toMatch(/<caption[^>]*class="[^"]*sr-only[^"]*">Specifications</)
  expect(html.match(/scope="row"/g)).toHaveLength(9)
  expect(
    [...html.matchAll(/scope="rowgroup"[^>]*>([^<]+)</g)].map((m) => m[1])
  ).toEqual(["Processor", "Memory", "Size and connectivity"])
  expect(html).toContain(">Works without BIOS update<")
  expect(html).toContain(">192 GB<")
})
