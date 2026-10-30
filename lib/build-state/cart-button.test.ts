import { describe, expect, test } from "vitest"

import { buildCartButton, cartButtonReasonText } from "./cart-button"

// docs/specs/026-add-build-to-cart, Behavior 1–2, E40–E43
const ready = {
  state: "ready",
  isEmpty: false,
  status: "ok",
  hasUnavailable: false,
} as const

describe("buildCartButton", () => {
  test("enabled for a build with no errors and every part buyable", () => {
    expect(buildCartButton(ready)).toEqual({ enabled: true, reasons: [] })
  })

  test("enabled with warnings: the dialog asks first", () => {
    expect(buildCartButton({ ...ready, status: "warnings" }).enabled).toBe(true)
  })

  test.each(["loading", "error"] as const)(
    "E41: %s → disabled with no reason text",
    (state) => {
      expect(buildCartButton({ ...ready, state })).toEqual({
        enabled: false,
        reasons: [],
      })
    }
  )

  test("E40: an empty build", () => {
    expect(buildCartButton({ ...ready, isEmpty: true })).toEqual({
      enabled: false,
      reasons: ["empty"],
    })
  })

  test("E42: errors", () => {
    expect(buildCartButton({ ...ready, status: "errors" })).toEqual({
      enabled: false,
      reasons: ["errors"],
    })
  })

  test("E43: a part that can't be bought", () => {
    expect(buildCartButton({ ...ready, hasUnavailable: true })).toEqual({
      enabled: false,
      reasons: ["unavailable"],
    })
  })

  test("errors and unavailable parts: both, errors first", () => {
    expect(
      buildCartButton({ ...ready, status: "errors", hasUnavailable: true })
        .reasons
    ).toEqual(["errors", "unavailable"])
  })
})

describe("cartButtonReasonText", () => {
  test("empty and errors have their own line", () => {
    expect(cartButtonReasonText("empty")).toBe(
      "Add parts to add your build to cart."
    )
    expect(cartButtonReasonText("errors")).toBe(
      "Fix the errors to add this build to cart."
    )
  })

  test("unavailable uses the summary's availability line instead", () => {
    expect(cartButtonReasonText("unavailable")).toBeNull()
  })
})
