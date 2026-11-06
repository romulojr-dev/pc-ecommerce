import { describe, expect, it } from "vitest"

import { FULFILLMENT_COPY } from "./fulfillment-copy"
import {
  cancelOutcomeOf,
  cancelView,
  fulfillmentView,
  outcomeOf,
} from "./fulfillment-view"

// docs/specs/043-order-fulfillment-transitions: B4, B5, B8 to B10, B13

const order = (over = {}) => ({
  status: "PAID" as const,
  fulfillment: "DELIVERY" as const,
  paymentOption: "ONLINE" as const,
  total: 2_311_000,
  ...over,
})

describe("fulfillmentView", () => {
  it("B5: a plain move lists no undo and whether the customer is emailed", () => {
    expect(fulfillmentView(order()).choice).toMatchObject({
      to: "PROCESSING",
      button: "Start processing",
      ship: false,
      statusName: "processing",
      lines: ["This can't be undone.", "No email is sent for this step."],
    })
    expect(fulfillmentView(order({ status: "SHIPPED" })).choice?.lines).toEqual(
      ["This can't be undone.", "An email goes to the customer."]
    )
  })

  it("B6: Shipped asks for the details and says both are emailed", () => {
    const { choice } = fulfillmentView(order({ status: "PROCESSING" }))
    expect(choice).toMatchObject({ to: "SHIPPED", ship: true })
    expect(choice?.lines).toContain(
      "Both are emailed to the customer and can't be changed."
    )
  })

  it("B5: a cash order's hand-over says how much is recorded as paid", () => {
    const delivered = fulfillmentView(
      order({ status: "SHIPPED", paymentOption: "COD" })
    ).choice
    expect(delivered?.lines).toContain(
      "₱23,110.00 will be recorded as paid in cash."
    )
    const pickedUp = fulfillmentView(
      order({
        status: "READY_FOR_PICKUP",
        fulfillment: "PICKUP",
        paymentOption: "COD",
      })
    ).choice
    expect(pickedUp?.lines).toContain(
      "₱23,110.00 will be recorded as paid in cash."
    )
    expect(pickedUp?.lines).toContain("No email is sent for this step.")
  })

  it("an online order's hand-over does not mention cash", () => {
    const lines = fulfillmentView(order({ status: "SHIPPED" })).choice?.lines
    expect(lines?.join(" ")).not.toContain("cash")
  })

  it("B13: no move, a reason", () => {
    for (const status of [
      "PENDING_PAYMENT",
      "PENDING_CONFIRMATION",
      "DELIVERED",
      "PICKED_UP",
      "CANCELLED",
      "REFUNDED",
    ] as const) {
      const view = fulfillmentView(order({ status }))
      expect(view.choice).toBeNull()
      expect(view.reason).toBeTruthy()
    }
  })
})

describe("outcomeOf", () => {
  it("B8: the success line names the email only when one is sent", () => {
    for (const to of ["SHIPPED", "READY_FOR_PICKUP", "DELIVERED"] as const) {
      expect(
        outcomeOf({ ok: true, data: { kind: "done", status: to } })
      ).toMatchObject({
        kind: "success",
        text: expect.stringContaining(
          "The customer will get an email shortly."
        ),
      })
    }
    for (const to of ["PROCESSING", "PICKED_UP"] as const) {
      expect(FULFILLMENT_COPY.success[to]).not.toContain("email")
    }
    expect(FULFILLMENT_COPY.success.SHIPPED).toBe(
      "Marked as shipped. The customer will get an email shortly."
    )
  })

  it("B9/B10: stale, not allowed, not found and guard errors", () => {
    expect(outcomeOf({ ok: true, data: { kind: "stale" } })).toEqual({
      kind: "error",
      text: FULFILLMENT_COPY.stale,
      stale: true,
    })
    expect(
      outcomeOf({ ok: true, data: { kind: "not-allowed" } })
    ).toMatchObject({ text: "That change isn't allowed for this order." })
    expect(outcomeOf({ ok: true, data: { kind: "not-found" } })).toMatchObject({
      text: "This order wasn't found.",
    })
    expect(
      outcomeOf({ ok: false, message: "This account is read-only" })
    ).toEqual({
      kind: "error",
      text: "This account is read-only",
      stale: false,
    })
  })
})

// docs/specs/044-admin-cancel-order: B5, B6, B8 to B12
describe("cancelView", () => {
  const base = {
    status: "PAID" as const,
    total: 2_311_000,
    paidAt: new Date("2026-11-02T06:10:00Z"),
    voucherCode: null,
    payments: [],
  }

  it("lists the effects of a paid order with a voucher", () => {
    const view = cancelView({ ...base, voucherCode: "SAVE500" })
    expect(view).toEqual({
      kind: "available",
      effects: [
        "The order becomes Cancelled. This can't be undone.",
        "Reserved stock goes back on sale.",
        "The use of voucher SAVE500 goes back.",
        "The customer is emailed.",
        "₱23,110.00 was paid. The order will be marked Refund required. Return the money by hand, then record the refund.",
      ],
    })
  })

  it("an unpaid order says nothing was charged, and names an open session", () => {
    const view = cancelView({
      ...base,
      status: "PENDING_PAYMENT",
      paidAt: null,
      payments: [{ status: "PENDING", sessionId: "ps-1", problem: null }],
    })
    expect(view).toMatchObject({ kind: "available" })
    const effects = (view as { effects: string[] }).effects
    expect(effects).toContain("The customer has not been charged.")
    expect(effects).toContain("The open payment session is closed first.")
  })

  it("has no cancel from Shipped, and a flagged payment blocks it", () => {
    expect(cancelView({ ...base, status: "SHIPPED" })).toEqual({ kind: "none" })
    expect(
      cancelView({
        ...base,
        payments: [{ status: "PAID", sessionId: "ps-1", problem: "LATE" }],
      })
    ).toMatchObject({ kind: "blocked" })
  })
})

describe("cancelOutcomeOf", () => {
  it("success mentions the refund only for a paid order", () => {
    expect(
      cancelOutcomeOf({
        ok: true,
        data: { kind: "done", refundRequired: false },
      })
    ).toEqual({
      kind: "success",
      text: "Order cancelled. The customer will get an email shortly.",
    })
    expect(
      cancelOutcomeOf({
        ok: true,
        data: { kind: "done", refundRequired: true },
      })
    ).toMatchObject({
      text: expect.stringContaining("Refund required: record it once"),
    })
  })

  it("maps each refusal to its message, with Reload for the stale ones", () => {
    const err = (kind: string) =>
      cancelOutcomeOf({ ok: true, data: { kind } as never })
    expect(err("stale")).toMatchObject({ kind: "error", stale: true })
    expect(err("paid-meanwhile")).toMatchObject({
      text: "This order was just paid, so it wasn't cancelled. Reload to see it.",
      stale: true,
    })
    expect(err("gateway-failed")).toMatchObject({
      text: "Couldn't reach the payment provider, so the order wasn't cancelled. Try again.",
      stale: false,
    })
    expect(err("needs-review").kind).toBe("error")
    expect(err("not-allowed").kind).toBe("error")
    expect(err("not-found").kind).toBe("error")
    expect(
      cancelOutcomeOf({ ok: false, message: "This account is read-only" })
    ).toMatchObject({ text: "This account is read-only" })
  })
})
