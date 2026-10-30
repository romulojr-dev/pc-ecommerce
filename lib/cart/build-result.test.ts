import { describe, expect, test } from "vitest"

import type { Issue } from "@/lib/builder"

import { buildResultView, FAILED_VIEW, reloadsParts } from "./build-result"
import { BUILD_COPY } from "./copy"
import type { BuildCartResult } from "./types"

// docs/specs/026-add-build-to-cart, Behavior 5 and 7: what the builder says
// for each result of the action
const issue = (message: string, severity: Issue["severity"]): Issue => ({
  rule: "socket-match",
  severity,
  parts: [],
  message,
})

describe("buildResultView", () => {
  test("E44: added", () => {
    expect(buildResultView({ ok: true, status: "added", count: 1 })).toEqual({
      kind: "success",
      text: "Added your build to your cart.",
    })
  })

  test("E45: already in the cart", () => {
    expect(
      buildResultView({ ok: true, status: "already-in-cart", count: 1 })
    ).toEqual({ kind: "success", text: "This build is already in your cart." })
  })

  test("errors the client didn't show: the lead, then the messages", () => {
    expect(
      buildResultView({
        ok: false,
        reason: "errors",
        issues: [issue("A doesn't fit B.", "error")],
      })
    ).toEqual({
      kind: "alert",
      lead: "This build can't be added to your cart:",
      lines: ["A doesn't fit B."],
    })
  })

  test("E48: not enough stock, one line per product", () => {
    const view = buildResultView({
      ok: false,
      reason: "stock",
      shortages: [
        {
          productId: "p1",
          name: "AMD Ryzen 5 7600",
          stock: 1,
          inCart: 1,
          needs: 1,
          limit: "stock",
        },
      ],
    })
    expect(view).toEqual({
      kind: "alert",
      lead: BUILD_COPY.refused,
      lines: [
        "Not enough stock for AMD Ryzen 5 7600: 1 in stock, 1 already in your cart.",
      ],
    })
  })

  test("parts that can't be bought: one line, no lead", () => {
    expect(
      buildResultView({
        ok: false,
        reason: "unavailable",
        parts: [{ name: "ASUS Dual RTX 4060", why: "not-buyable" }],
      })
    ).toEqual({
      kind: "alert",
      lead: null,
      lines: [
        "The ASUS Dual RTX 4060 can't be bought right now. Replace it in the builder to add this build to cart.",
      ],
    })
  })

  test("E47: warnings the shopper hasn't seen go back to the dialog", () => {
    const warnings = [issue("Close to its limit.", "warning")]
    expect(buildResultView({ ok: false, reason: "confirm", warnings })).toEqual(
      { kind: "confirm", warnings }
    )
  })

  test("a quantity above the limit names the part when it can", () => {
    const result: BuildCartResult = {
      ok: false,
      reason: "quantity-too-high",
      slot: "memory",
      productId: "p9",
      max: 99,
    }
    expect(buildResultView(result, () => "Corsair Vengeance")).toEqual({
      kind: "alert",
      lead: null,
      lines: ["You can add up to 99 of the Corsair Vengeance in a build."],
    })
    expect(
      buildResultView(result).kind === "alert" && buildResultView(result)
    ).toMatchObject({
      lines: ["You can add up to 99 of one part in a build."],
    })
  })

  test.each(["invalid", "empty", "too-many-parts", "error"] as const)(
    "E49: %s → the generic failure",
    (reason) => {
      expect(buildResultView({ ok: false, reason })).toEqual(FAILED_VIEW)
      expect(FAILED_VIEW.lines).toEqual([
        "Couldn't add your build to your cart. Try again.",
      ])
    }
  )
})

describe("reloadsParts (D14)", () => {
  test("errors, unavailable parts and new warnings reload the builder's parts", () => {
    expect(reloadsParts({ ok: false, reason: "errors", issues: [] })).toBe(true)
    expect(reloadsParts({ ok: false, reason: "unavailable", parts: [] })).toBe(
      true
    )
    expect(reloadsParts({ ok: false, reason: "confirm", warnings: [] })).toBe(
      true
    )
  })

  test("success, stock and failures don't", () => {
    expect(reloadsParts({ ok: true, status: "added", count: 1 })).toBe(false)
    expect(reloadsParts({ ok: false, reason: "stock", shortages: [] })).toBe(
      false
    )
    expect(reloadsParts({ ok: false, reason: "error" })).toBe(false)
  })
})
