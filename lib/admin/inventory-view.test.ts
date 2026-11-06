import { describe, expect, it } from "vitest"

import {
  levelLabel,
  movementCells,
  refusalText,
  resultText,
  reviewState,
  reviewText,
  signedChange,
  stockLevel,
  unrecordedText,
} from "./inventory-view"

// docs/specs/046-admin-inventory-adjustments: E2–E4, E26, E38–E40, E43

describe("stockLevel", () => {
  it("0 is out; 1 up to lowStockAt is low; above is ok", () => {
    expect(stockLevel({ stock: 0, lowStockAt: 5 })).toBe("out")
    expect(stockLevel({ stock: 1, lowStockAt: 5 })).toBe("low")
    expect(stockLevel({ stock: 5, lowStockAt: 5 })).toBe("low")
    expect(stockLevel({ stock: 6, lowStockAt: 5 })).toBe("ok")
  })

  it("E22: a threshold of 0 turns low off, but out still shows", () => {
    expect(stockLevel({ stock: 1, lowStockAt: 0 })).toBe("ok")
    expect(stockLevel({ stock: 0, lowStockAt: 0 })).toBe("out")
  })

  it("labels only out and low", () => {
    expect(levelLabel("out")).toBe("Out of stock")
    expect(levelLabel("low")).toBe("Low stock")
    expect(levelLabel("ok")).toBeNull()
  })
})

describe("the confirm step", () => {
  it("E38: reads before → after with the reason and signed quantity", () => {
    expect(reviewText(12, "RECEIVED", 100)).toBe(
      "Stock 12 → 112. Received +100."
    )
    expect(reviewText(12, "DAMAGED", -3)).toBe("Stock 12 → 9. Damaged −3.")
    expect(reviewText(10, "CORRECTION", -2)).toBe(
      "Stock 10 → 8. Correction −2."
    )
  })

  it("E39: Confirm is withheld below 0 and above 1,000,000", () => {
    expect(reviewState(12, 100)).toMatchObject({ after: 112, status: "ok" })
    expect(reviewState(4, -5)).toMatchObject({
      status: "below-zero",
      message: "This would take stock below 0.",
    })
    expect(reviewState(999_995, 10)).toMatchObject({
      status: "above-ceiling",
      message: "This would take stock above 1,000,000.",
    })
    expect(reviewState(999_995, 5).status).toBe("ok")
    expect(reviewState(5, -5).status).toBe("ok")
  })

  it("E40: the result says so when the stock moved since the page loaded", () => {
    expect(resultText({ newStock: 112, delta: 100, shownStock: 12 })).toBe(
      "Stock is now 112."
    )
    expect(resultText({ newStock: 110, delta: 100, shownStock: 12 })).toBe(
      "Stock is now 110. It was 10 when you confirmed, not 12."
    )
  })

  it("words a refusal with the current stock", () => {
    expect(refusalText({ kind: "too-low", stock: 4 }, -5)).toBe(
      "Can't remove 5: only 4 in stock."
    )
    expect(refusalText({ kind: "too-high", stock: 999_995 }, 10)).toBe(
      "Stock can't go above 1,000,000. It is 999,995 now."
    )
  })
})

describe("history", () => {
  it("signs changes with a real minus", () => {
    expect(signedChange(5)).toBe("+5")
    expect(signedChange(-2)).toBe("−2")
  })

  it("E26: a row shows the staff name, 'System' without an actor, and the order", () => {
    const base = {
      id: "m1",
      createdAt: new Date("2026-11-04T01:30:00Z"),
      reason: "RECEIVED",
      change: 20,
      orderNumber: null,
      actorName: "Ana Staff",
      note: null,
    }
    expect(movementCells(base)).toMatchObject({
      reason: "Received",
      change: "+20",
      by: "Ana Staff",
      note: "—",
      orderNumber: null,
    })
    expect(
      movementCells({
        ...base,
        reason: "ORDER_RELEASED",
        change: 2,
        orderNumber: "PCS-ABCD2345",
        actorName: null,
      })
    ).toMatchObject({
      reason: "Order released",
      by: "System",
      orderNumber: "PCS-ABCD2345",
    })
  })

  it("E43: the footer names the first movement's date in Manila time", () => {
    // 4 Nov 2026 00:30 in Manila is still 3 Nov in UTC
    expect(unrecordedText(new Date("2026-11-03T16:30:00Z"))).toBe(
      "Changes before 4 Nov 2026 aren't recorded."
    )
  })
})
