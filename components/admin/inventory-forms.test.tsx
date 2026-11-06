import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { MovementList } from "@/lib/admin/queries/inventory"

import { AdjustStockForm } from "./adjust-stock-form"
import { MovementHistory } from "./movement-history"
import { ThresholdForm } from "./threshold-form"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock("@/app/admin/(shell)/inventory/actions", () => ({
  adjustStockAction: vi.fn(),
  setLowStockAtAction: vi.fn(),
}))

// docs/specs/046-admin-inventory-adjustments: the forms and the history as
// markup (B9, B13–B15). The review step, the pending state and the results
// are driven in a browser by e2e/admin-inventory.spec.ts.

describe("AdjustStockForm", () => {
  const html = (readOnly = false) =>
    renderToStaticMarkup(
      <AdjustStockForm productId="p1" stock={12} readOnly={readOnly} />
    )

  it("B9: offers the three reasons, a quantity, a note and Review", () => {
    const out = html()
    for (const text of [
      "Adjust stock",
      "Choose a reason",
      "Received",
      "Damaged",
      "Correction",
      "Quantity",
      "Note (optional)",
      "Review adjustment",
    ]) {
      expect(out).toContain(text)
    }
    // Nothing is written from the first step: no Confirm until reviewed
    expect(out).not.toContain(">Confirm<")
    // No 'set to N' control
    expect(out).not.toMatch(/set (stock )?to/i)
  })

  it("is read-only for Demo: disabled, no Review button", () => {
    const out = html(true)
    expect(out).toContain("This account is read-only.")
    expect(out).toContain("<fieldset disabled")
    expect(out).not.toContain("Review adjustment")
  })
})

describe("ThresholdForm", () => {
  it("B13: shows the current value and the hint", () => {
    const out = renderToStaticMarkup(
      <ThresholdForm productId="p1" lowStockAt={5} readOnly={false} />
    )
    expect(out).toContain('value="5"')
    expect(out).toContain("Use 0 to turn it off.")
    expect(out).toContain("Save threshold")
  })

  it("has no Save for Demo", () => {
    const out = renderToStaticMarkup(
      <ThresholdForm productId="p1" lowStockAt={5} readOnly />
    )
    expect(out).toContain("<fieldset disabled")
    expect(out).not.toContain("Save threshold")
  })
})

describe("MovementHistory", () => {
  const data = (over: Partial<MovementList> = {}): MovementList => ({
    ok: true,
    rows: [
      {
        id: "m2",
        createdAt: new Date("2026-11-04T01:30:00Z"),
        reason: "CORRECTION",
        change: -1,
        orderNumber: null,
        actorName: "Ana Staff",
        note: "Shelf count was 25",
      },
      {
        id: "m1",
        createdAt: new Date("2026-11-03T01:30:00Z"),
        reason: "ORDER_RESERVED",
        change: -2,
        orderNumber: "PCS-ABCD2345",
        actorName: null,
        note: null,
      },
    ],
    total: 2,
    page: 1,
    pageCount: 1,
    firstAt: new Date("2026-11-03T01:30:00Z"),
    ...over,
  })
  const html = (list: MovementList) =>
    renderToStaticMarkup(<MovementHistory productId="p1" data={list} />)

  it("E26: signed changes, the order linked, the staff name or System, the note", () => {
    const out = html(data())
    expect(out).toContain("Correction")
    expect(out).toContain("−1")
    expect(out).toContain("Ana Staff")
    expect(out).toContain("Shelf count was 25")
    expect(out).toContain("Order placed")
    expect(out).toContain("System")
    expect(out).toContain('href="/admin/orders/PCS-ABCD2345"')
  })

  it("E43: ends with what isn't recorded, in Manila time", () => {
    expect(html(data())).toContain(
      "Changes before 3 Nov 2026 aren&#x27;t recorded."
    )
  })

  it("E29: no movements, no footer", () => {
    const out = html(data({ rows: [], total: 0, firstAt: null }))
    expect(out).toContain("No stock movements yet.")
    expect(out).not.toContain("aren&#x27;t recorded")
  })

  it("E28: pages link with ?page=", () => {
    const out = html(data({ page: 2, pageCount: 3 }))
    expect(out).toContain('href="/admin/inventory/p1"')
    expect(out).toContain('href="/admin/inventory/p1?page=3"')
  })
})
