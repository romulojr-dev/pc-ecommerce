import { describe, expect, test } from "vitest"

import {
  addOutcomeLines,
  BUILD_COPY,
  buildQuantityText,
  capNoteText,
  groupLabel,
  groupName,
  notBuyableText,
  removedGroupText,
  removedText,
  shortageText,
  subtotalLabel,
  unavailableText,
  warningsLead,
} from "./copy"

// docs/specs/025-cart-single-items, §5 Messages and copy
describe("capNoteText", () => {
  test("stock", () => {
    expect(capNoteText({ kind: "stock", stock: 5, total: 5 })).toBe(
      "Only 5 in stock. You have 5 in your cart."
    )
  })

  test("the 99 limit", () => {
    expect(capNoteText({ kind: "max", max: 99 })).toBe(
      "You can have up to 99 of one part in your cart."
    )
  })
})

describe("addOutcomeLines", () => {
  const note = { kind: "stock", stock: 5, total: 5 } as const

  test("everything added", () => {
    expect(addOutcomeLines(2)).toEqual(["Added to your cart."])
  })

  test("some added: the count, then the note", () => {
    expect(addOutcomeLines(2, note)).toEqual([
      "Added 2 to your cart.",
      "Only 5 in stock. You have 5 in your cart.",
    ])
  })

  test("none added: the note alone", () => {
    expect(addOutcomeLines(0, note)).toEqual([
      "Only 5 in stock. You have 5 in your cart.",
    ])
  })
})

describe("other copy", () => {
  test("removed", () => {
    expect(removedText("AMD Ryzen 5 7600")).toBe(
      "Removed AMD Ryzen 5 7600 from your cart."
    )
  })

  test("not buyable depends on whether Add to build is there", () => {
    expect(notBuyableText(true)).toBe(
      "Only parts in stock can be added to your cart or build."
    )
    expect(notBuyableText(false)).toBe(
      "Only parts in stock can be added to your cart."
    )
  })

  test("subtotal label is singular for 1", () => {
    expect(subtotalLabel(1)).toBe("Subtotal (1 item)")
    expect(subtotalLabel(3)).toBe("Subtotal (3 items)")
  })
})

// docs/specs/026-add-build-to-cart, §5 Messages and copy
describe("shortageText", () => {
  const base = {
    productId: "p1",
    name: "AMD Ryzen 5 7600",
    stock: 1,
    inCart: 1,
    needs: 1,
    limit: "stock",
  } as const

  test("E14: stock, with what is already in the cart", () => {
    expect(shortageText(base)).toBe(
      "Not enough stock for AMD Ryzen 5 7600: 1 in stock, 1 already in your cart."
    )
  })

  test("E18: stock, with nothing in the cart, says what the build needs", () => {
    expect(
      shortageText({
        ...base,
        name: "Corsair Vengeance",
        inCart: 0,
        needs: 2,
      })
    ).toBe(
      "Not enough stock for Corsair Vengeance: 1 in stock, your build needs 2."
    )
  })

  test("E20: the 99 limit", () => {
    expect(
      shortageText({ ...base, stock: 500, inCart: 98, limit: "max" })
    ).toBe(
      "Not enough room for AMD Ryzen 5 7600: you can have up to 99 of one part in your cart, and 98 are already in it."
    )
  })

  test("the 99 limit with one already in the cart", () => {
    expect(
      shortageText({ ...base, stock: 500, inCart: 1, limit: "max" })
    ).toContain("and 1 is already in it.")
  })
})

describe("unavailableText", () => {
  test("one part that can't be bought now", () => {
    expect(
      unavailableText([{ name: "ASUS Dual RTX 4060", why: "not-buyable" }])
    ).toBe(
      "The ASUS Dual RTX 4060 can't be bought right now. Replace it in the builder to add this build to cart."
    )
  })

  test("one part that is no longer sold", () => {
    expect(
      unavailableText([{ name: "Lian Li LANCOOL 216", why: "retired" }])
    ).toBe(
      "The Lian Li LANCOOL 216 is no longer sold. Replace it in the builder to add this build to cart."
    )
  })

  test("several parts are counted, not named", () => {
    expect(
      unavailableText([
        { name: "A", why: "not-buyable" },
        { name: "B", why: "retired" },
      ])
    ).toBe(
      "2 parts in this build can't be bought right now or are no longer sold. Replace them in the builder to add this build to cart."
    )
  })
})

describe("warningsLead", () => {
  test("one or several warnings", () => {
    expect(warningsLead(1, false)).toBe(
      "Your build may still work, but check this warning first:"
    )
    expect(warningsLead(2, false)).toBe(
      "Your build may still work, but check these warnings first:"
    )
  })

  test("after the server found warnings the shopper hadn't seen", () => {
    expect(warningsLead(1, true)).toBe(
      "Something in your build changed since it loaded. Check this warning before adding it:"
    )
    expect(warningsLead(3, true)).toBe(
      "Something in your build changed since it loaded. Check these warnings before adding it:"
    )
  })
})

describe("build groups", () => {
  test("E32: one group is not numbered", () => {
    expect(groupName(null)).toBe("Custom PC build")
    expect(groupLabel(null, 8)).toBe("Custom PC build · 8 parts")
    expect(groupLabel(null, 1)).toBe("Custom PC build · 1 part")
  })

  test("E36: two or more are numbered", () => {
    expect(groupName(2)).toBe("Custom PC build 2")
    expect(groupLabel(1, 8)).toBe("Custom PC build 1 · 8 parts")
  })

  test("removed", () => {
    expect(removedGroupText(null)).toBe(
      "Removed Custom PC build from your cart."
    )
    expect(removedGroupText(2)).toBe(
      "Removed Custom PC build 2 from your cart."
    )
  })
})

describe("other build copy", () => {
  test("results", () => {
    expect(BUILD_COPY.added).toBe("Added your build to your cart.")
    expect(BUILD_COPY.already).toBe("This build is already in your cart.")
    expect(BUILD_COPY.refused).toBe("This build can't be added to your cart:")
    expect(BUILD_COPY.failed).toBe(
      "Couldn't add your build to your cart. Try again."
    )
  })

  test("a quantity above the limit", () => {
    expect(buildQuantityText(99, "Corsair Vengeance")).toBe(
      "You can add up to 99 of the Corsair Vengeance in a build."
    )
    expect(buildQuantityText(99)).toBe(
      "You can add up to 99 of one part in a build."
    )
  })
})
