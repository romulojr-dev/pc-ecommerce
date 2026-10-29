import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test, vi } from "vitest"

import { sharedBuildView } from "@/lib/build-state/shared"
import { buildA } from "@/test-support/seed-parts"
import { partsOf, snapshot } from "@/test-support/shared-snapshot"

import { OpenInBuilder, replaceBody } from "./open-in-builder"

// Open in builder's markup and copy (docs/specs/022-share-build, Behavior
// 20–22). Clicking, the dialog and the navigation are in the E2E tests.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }))

describe("OpenInBuilder", () => {
  const plan = sharedBuildView(snapshot(partsOf(buildA()))).openPlan

  test("renders the same button whatever is saved (Behavior 20)", () => {
    const html = renderToStaticMarkup(<OpenInBuilder plan={plan} />)
    expect(html).toMatch(/<button[^>]*>Open in builder<\/button>/)
    // The dialog is closed until it is needed
    expect(html).not.toContain("Replace your current build?")
  })
})

describe("replaceBody", () => {
  test("counts one part (E50)", () => {
    expect(replaceBody(1)).toBe(
      "Opening this build replaces the 1 part in your builder."
    )
  })

  test("counts several (E51a)", () => {
    expect(replaceBody(9)).toBe(
      "Opening this build replaces the 9 parts in your builder."
    )
  })
})
