import { describe, expect, test } from "vitest"

import {
  addOutcomeLines,
  capNoteText,
  notBuyableText,
  removedText,
  subtotalLabel,
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
