import { describe, expect, it } from "vitest"

import {
  adjustmentFromForm,
  adjustStockSchema,
  setLowStockAtSchema,
  thresholdFromText,
  validateAdjustment,
  validateThreshold,
} from "./inventory-input"

// docs/specs/046-admin-inventory-adjustments: E9–E15, E23, E44

const form = (
  over: Partial<Parameters<typeof adjustmentFromForm>[0]> = {}
) => ({
  reason: "RECEIVED",
  quantity: "20",
  direction: "",
  note: "",
  ...over,
})

describe("adjustmentFromForm", () => {
  it("Received is a positive delta, Damaged a negative one", () => {
    expect(adjustmentFromForm(form())).toEqual({
      ok: true,
      value: { reason: "RECEIVED", delta: 20, note: null },
    })
    expect(
      adjustmentFromForm(form({ reason: "DAMAGED", quantity: "3" }))
    ).toEqual({
      ok: true,
      value: { reason: "DAMAGED", delta: -3, note: null },
    })
  })

  it("E9: a Correction takes its sign from the direction and needs a note", () => {
    expect(
      adjustmentFromForm(
        form({
          reason: "CORRECTION",
          quantity: "2",
          direction: "remove",
          note: "  Shelf count was 25 ",
        })
      )
    ).toEqual({
      ok: true,
      value: { reason: "CORRECTION", delta: -2, note: "Shelf count was 25" },
    })
    expect(
      adjustmentFromForm(
        form({ reason: "CORRECTION", quantity: "1", direction: "add" })
      )
    ).toMatchObject({
      ok: false,
      errors: { note: "Add a note explaining the correction." },
    })
  })

  it("E10, E11: a Correction note of nothing, spaces or 2 characters is refused", () => {
    for (const note of ["", "   ", "ab"]) {
      expect(
        adjustmentFromForm(
          form({ reason: "CORRECTION", direction: "add", note })
        )
      ).toMatchObject({ ok: false, errors: { note: expect.any(String) } })
    }
  })

  it("a Correction without a direction is refused", () => {
    expect(
      adjustmentFromForm(form({ reason: "CORRECTION", note: "recount" }))
    ).toMatchObject({
      ok: false,
      errors: { direction: "Choose add or remove." },
    })
  })

  it("E13: quantities that are not whole numbers of 1 or more are refused", () => {
    for (const quantity of [
      "0",
      "00",
      "-3",
      "2.5",
      "abc",
      "",
      " ",
      "1e3",
      "+4",
      "1,000",
    ]) {
      expect(adjustmentFromForm(form({ quantity }))).toMatchObject({
        ok: false,
        errors: { quantity: "Enter a whole number of 1 or more." },
      })
    }
  })

  it("E13: 1,000,000 is the largest quantity", () => {
    expect(adjustmentFromForm(form({ quantity: "1000000" })).ok).toBe(true)
    for (const quantity of ["1000001", "99999999999999999999"]) {
      expect(adjustmentFromForm(form({ quantity }))).toMatchObject({
        ok: false,
        errors: { quantity: "Enter a smaller quantity." },
      })
    }
  })

  it("E44: a note is allowed up to 500 characters", () => {
    expect(adjustmentFromForm(form({ note: "x".repeat(500) })).ok).toBe(true)
    expect(adjustmentFromForm(form({ note: "x".repeat(501) }))).toMatchObject({
      ok: false,
      errors: { note: "Keep the note to 500 characters." },
    })
  })

  it("an unknown or empty reason is refused, with every problem reported at once", () => {
    const result = adjustmentFromForm(form({ reason: "", quantity: "x" }))
    expect(result).toMatchObject({
      ok: false,
      errors: { reason: "Choose a reason.", quantity: expect.any(String) },
    })
  })
})

describe("validateAdjustment (what the server checks)", () => {
  const check = (reason: string, delta: number, note = "") =>
    validateAdjustment({ reason, delta, note })

  it("E14: zero, and a sign the reason does not allow, are refused", () => {
    expect(check("RECEIVED", 0).ok).toBe(false)
    expect(check("RECEIVED", -5).ok).toBe(false)
    expect(check("DAMAGED", 5).ok).toBe(false)
    expect(check("CORRECTION", 0, "note").ok).toBe(false)
  })

  it("accepts the allowed signs", () => {
    expect(check("RECEIVED", 5).ok).toBe(true)
    expect(check("DAMAGED", -5).ok).toBe(true)
    expect(check("CORRECTION", 5, "recount").ok).toBe(true)
    expect(check("CORRECTION", -5, "recount").ok).toBe(true)
  })

  it("refuses the order reasons and unknown ones: staff cannot write them", () => {
    expect(check("ORDER_RESERVED", -1).ok).toBe(false)
    expect(check("ORDER_RELEASED", 1).ok).toBe(false)
    expect(check("nope", 1).ok).toBe(false)
  })

  it("refuses a delta past a million, a fraction and NaN", () => {
    expect(check("RECEIVED", 1_000_001).ok).toBe(false)
    expect(check("RECEIVED", 2.5).ok).toBe(false)
    expect(check("RECEIVED", Number.NaN).ok).toBe(false)
  })
})

describe("transport schemas (E15)", () => {
  const ok = {
    productId: "p1",
    reason: "RECEIVED",
    delta: 5,
    note: "",
    shownStock: 10,
  }

  it("accepts the delta shape", () => {
    expect(adjustStockSchema.safeParse(ok).success).toBe(true)
  })

  it("refuses 'set to N', stock and any other key", () => {
    for (const extra of [
      { stock: 50 },
      { setStock: 50 },
      { effectivePrice: 1 },
    ]) {
      expect(adjustStockSchema.safeParse({ ...ok, ...extra }).success).toBe(
        false
      )
    }
  })

  it("refuses a non-integer or oversized delta", () => {
    for (const delta of [1.5, "5", 1_000_001, null]) {
      expect(adjustStockSchema.safeParse({ ...ok, delta }).success).toBe(false)
    }
  })

  it("the threshold schema is strict too", () => {
    expect(
      setLowStockAtSchema.safeParse({ productId: "p1", lowStockAt: 8 }).success
    ).toBe(true)
    expect(
      setLowStockAtSchema.safeParse({
        productId: "p1",
        lowStockAt: 8,
        stock: 1,
      }).success
    ).toBe(false)
  })
})

describe("the threshold (E23)", () => {
  it("accepts 0 to 1000", () => {
    for (const n of [0, 5, 1000]) expect(validateThreshold(n).ok).toBe(true)
  })

  it("refuses below 0, above 1000 and fractions", () => {
    for (const n of [-1, 1001, 2.5, Number.NaN]) {
      expect(validateThreshold(n).ok).toBe(false)
    }
  })

  it("reads typed text digit by digit", () => {
    expect(thresholdFromText(" 8 ")).toEqual({ ok: true, value: 8 })
    expect(thresholdFromText("0")).toEqual({ ok: true, value: 0 })
    for (const text of ["", "-1", "2.5", "1001", "abc", "1e2", "10000"]) {
      expect(thresholdFromText(text).ok).toBe(false)
    }
  })
})
