import { describe, expect, test } from "vitest"

import { auditDiff, flattenAudit } from "./audit-diff"

// docs/specs/047-admin-audit-log-view: B9, R6, E12 to E14

describe("auditDiff", () => {
  test("E12: only the changed keys, sorted", () => {
    expect(
      auditDiff({ price: 1299900, stock: 5 }, { price: 1199900, stock: 5 })
    ).toEqual([{ path: "price", before: 1299900, after: 1199900 }])
  })

  test("E13: nested objects are flattened and only differing leaves are listed", () => {
    expect(
      auditDiff(
        { specs: { cores: 6, socket: "AM5" } },
        { specs: { cores: 8, socket: "AM5" } }
      )
    ).toEqual([{ path: "specs.cores", before: 6, after: 8 }])
  })

  test("a create has no before; a delete no after", () => {
    expect(auditDiff(null, { name: "A", sku: "X" })).toEqual([
      { path: "name", before: undefined, after: "A" },
      { path: "sku", before: undefined, after: "X" },
    ])
    expect(auditDiff({ name: "A" }, undefined)).toEqual([
      { path: "name", before: "A", after: undefined },
    ])
  })

  test("a key on one side only is a row; an equal one is not", () => {
    expect(auditDiff({ a: 1, b: 2 }, { b: 2, c: 3 })).toEqual([
      { path: "a", before: 1, after: undefined },
      { path: "c", before: undefined, after: 3 },
    ])
  })

  test("arrays of plain values are compared whole", () => {
    expect(
      auditDiff({ boxContents: ["a", "b"] }, { boxContents: ["a", "b"] })
    ).toEqual([])
    expect(
      auditDiff({ boxContents: ["a", "b"] }, { boxContents: ["a"] })
    ).toEqual([{ path: "boxContents", before: ["a", "b"], after: ["a"] }])
  })

  test("a null on a side is a value, not a missing key", () => {
    expect(auditDiff({ salePrice: null }, { salePrice: 100 })).toEqual([
      { path: "salePrice", before: null, after: 100 },
    ])
  })

  test("nothing to compare is no rows, and odd JSON never throws", () => {
    expect(auditDiff(null, null)).toEqual([])
    expect(auditDiff(undefined, {})).toEqual([])
    for (const odd of [5, "x", true, [], [1, 2], [{ a: 1 }], { "a.b": 1 }]) {
      expect(() => auditDiff(odd, { z: 1 })).not.toThrow()
    }
  })

  test("below the depth cap a subtree is one leaf", () => {
    let deep: unknown = { leaf: 1 }
    for (let i = 0; i < 10; i++) deep = { n: deep }
    const leaves = [...flattenAudit(deep).keys()]
    expect(leaves).toHaveLength(1)
    expect(leaves[0].split(".").length).toBeLessThanOrEqual(7)
  })
})
