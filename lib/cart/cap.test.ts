import { describe, expect, test } from "vitest"

import { capQuantity } from "./cap"

// docs/specs/025-cart-single-items, Rules › Stock cap. Stock in brackets.
const stockNote = (stock: number, total: number) => ({
  kind: "stock",
  stock,
  total,
})

describe("add", () => {
  test("E1: room for all of it", () => {
    expect(
      capQuantity({ op: "add", requested: 2, line: 0, others: 0, stock: 12 })
    ).toEqual({ quantity: 2 })
  })

  test("E2: merges into the line", () => {
    expect(
      capQuantity({ op: "add", requested: 1, line: 2, others: 0, stock: 12 })
    ).toEqual({ quantity: 3 })
  })

  test("E3 [5]: the line has 3, add 3 → 5, with the note", () => {
    expect(
      capQuantity({ op: "add", requested: 3, line: 3, others: 0, stock: 5 })
    ).toEqual({ quantity: 5, note: stockNote(5, 5) })
  })

  test("E4 [5]: empty cart, add 7 → 5", () => {
    expect(
      capQuantity({ op: "add", requested: 7, line: 0, others: 0, stock: 5 })
    ).toEqual({ quantity: 5, note: stockNote(5, 5) })
  })

  test("E5 [5]: already at the cap adds nothing", () => {
    expect(
      capQuantity({ op: "add", requested: 1, line: 5, others: 0, stock: 5 })
    ).toEqual({ quantity: 5, note: stockNote(5, 5) })
  })

  test("E6 [3]: a build group holds 2, add 2 → the line gets 1", () => {
    expect(
      capQuantity({ op: "add", requested: 2, line: 0, others: 2, stock: 3 })
    ).toEqual({ quantity: 1, note: stockNote(3, 3) })
  })

  test("E7 [2]: a build group holds 2, add 1 → nothing, no line", () => {
    expect(
      capQuantity({ op: "add", requested: 1, line: 0, others: 2, stock: 2 })
    ).toEqual({ quantity: 0, note: stockNote(2, 2) })
  })

  test("E15 [500]: the 99 limit decides", () => {
    expect(
      capQuantity({ op: "add", requested: 5, line: 98, others: 0, stock: 500 })
    ).toEqual({ quantity: 99, note: { kind: "max", max: 99 } })
  })

  test("exactly 99 in stock reads as stock", () => {
    expect(
      capQuantity({ op: "add", requested: 2, line: 98, others: 0, stock: 99 })
        .note
    ).toEqual(stockNote(99, 99))
  })

  test("exactly the room left has no note", () => {
    expect(
      capQuantity({ op: "add", requested: 2, line: 3, others: 0, stock: 5 })
    ).toEqual({ quantity: 5 })
  })
})

describe("set", () => {
  test("E16: lowering", () => {
    expect(
      capQuantity({ op: "set", requested: 1, line: 3, others: 0, stock: 12 })
    ).toEqual({ quantity: 1 })
  })

  test("E17 [2]: a group holds 1; the single line stays at 1", () => {
    expect(
      capQuantity({ op: "set", requested: 2, line: 1, others: 1, stock: 2 })
    ).toEqual({ quantity: 1, note: stockNote(2, 2) })
  })

  test("E18 [5]: single 2 → 4 with a group of 1", () => {
    expect(
      capQuantity({ op: "set", requested: 4, line: 2, others: 1, stock: 5 })
    ).toEqual({ quantity: 4 })
  })

  test("E19 [2]: stock dropped under the line; raising keeps it, with the note", () => {
    expect(
      capQuantity({ op: "set", requested: 4, line: 3, others: 0, stock: 2 })
    ).toEqual({ quantity: 3, note: stockNote(2, 3) })
  })

  test("E20 [2]: lowering below the cap always works, no note", () => {
    expect(
      capQuantity({ op: "set", requested: 2, line: 3, others: 0, stock: 2 })
    ).toEqual({ quantity: 2 })
  })

  test("lowering works even when the cart is over the cap", () => {
    expect(
      capQuantity({ op: "set", requested: 3, line: 3, others: 5, stock: 2 })
    ).toEqual({ quantity: 3 })
  })

  test("raising stops at the 99 limit across lines", () => {
    expect(
      capQuantity({ op: "set", requested: 99, line: 50, others: 5, stock: 500 })
    ).toEqual({ quantity: 94, note: { kind: "max", max: 99 } })
  })
})
