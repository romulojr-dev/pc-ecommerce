import { describe, expect, test } from "vitest"

import { shareErrorText } from "./share-copy"

// The share dialog's error lines (docs/specs/022-share-build, Messages)

describe("shareErrorText", () => {
  test.each(["invalid", "empty", "error"] as const)(
    "is the generic line for %s (E45)",
    (reason) => {
      expect(shareErrorText({ ok: false, reason })).toBe(
        "We couldn't create a link. Try again."
      )
    }
  )

  test("says a part is gone, and to reload (E46)", () => {
    expect(shareErrorText({ ok: false, reason: "unavailable" })).toBe(
      "A part in your build is no longer available. Reload the page to update your build."
    )
  })

  test("says there are too many parts", () => {
    expect(shareErrorText({ ok: false, reason: "too-many-parts" })).toBe(
      "Your build has too many parts to share."
    )
  })

  test("names the part whose quantity is too high, and says what to change (E14)", () => {
    expect(
      shareErrorText(
        {
          ok: false,
          reason: "quantity-too-high",
          slot: "memory",
          productId: "kit",
          max: 99,
        },
        (id) => (id === "kit" ? "Corsair Vengeance DDR5-6000 32 GB" : undefined)
      )
    ).toBe(
      "You can share up to 99 of one part. Lower the quantity of the Corsair Vengeance DDR5-6000 32 GB and try again."
    )
  })

  test("says 'that part' when it can't name it", () => {
    expect(
      shareErrorText({
        ok: false,
        reason: "quantity-too-high",
        slot: "memory",
        productId: "kit",
        max: 99,
      })
    ).toBe(
      "You can share up to 99 of one part. Lower the quantity of that part and try again."
    )
  })
})
