import { describe, expect, it } from "vitest"

import { f1, f2, f3, input, PARCEL, STORE } from "@/test-support/email-orders"

import { EMAIL_COPY } from "./copy"
import { emailView } from "./view"

// docs/specs/043-order-fulfillment-transitions: E27 and E28 on the data side

describe("emailView: ORDER_SHIPPED", () => {
  it("says it is on its way, with courier, tracking, time, items and address", () => {
    const view = emailView("ORDER_SHIPPED", input(f1()))
    expect(view.subject).toBe("[Demo] Order PCS-7KQ2M9XD has shipped")
    expect(view.greeting).toBe("Hi Ana Santos,")
    expect(view.lead).toBe("Your order PCS-7KQ2M9XD is on its way.")
    expect(view.details).toEqual([
      "Courier: LBC",
      "Tracking number: 123456784821",
      "Shipped Mon 2 Nov 2026, 9:30 AM",
    ])
    expect(view.entries).toHaveLength(1)
    expect(view.where?.kind).toBe("delivery")
    expect(view.action).toEqual({
      label: EMAIL_COPY.viewOrder,
      href: input(f1()).viewUrl,
    })
    expect(view.statusLine).toBeNull()
  })

  it("a cash order says how much to have ready", () => {
    const view = emailView(
      "ORDER_SHIPPED",
      input(f1({ paymentOption: "COD", paidAt: null }))
    )
    expect(view.details).toContain(
      "Please have ₱23,110.00 ready when it arrives."
    )
  })

  it("has a status line only once the order is Cancelled or Refunded (E28)", () => {
    expect(emailView("ORDER_SHIPPED", input(f3())).statusLine).toBeNull()
    expect(
      emailView("ORDER_SHIPPED", input(f1({ status: "REFUNDED" }))).statusLine
    ).toBe("Status: Refunded")
  })

  it("a missing time or parcel detail is a bug, not a blank", () => {
    expect(() =>
      emailView("ORDER_SHIPPED", input(f1({ shippedAt: null })))
    ).toThrow()
    expect(() =>
      emailView("ORDER_SHIPPED", input(f1({ courier: null })))
    ).toThrow()
    expect(() =>
      emailView("ORDER_SHIPPED", input(f1({ trackingNumber: null })))
    ).toThrow()
  })
})

describe("emailView: READY_FOR_PICKUP", () => {
  it("says it is ready, with the time, the store's address and hours", () => {
    const view = emailView("READY_FOR_PICKUP", input(f2(), { store: STORE }))
    expect(view.subject).toBe("[Demo] Order PCS-4TN8V2HC is ready for pickup")
    expect(view.lead).toBe("Your order PCS-4TN8V2HC is ready for pickup.")
    expect(view.details).toEqual(["Ready Mon 2 Nov 2026, 11:00 AM"])
    expect(view.where).toMatchObject({
      kind: "pickup",
      address: STORE.address,
      hours: STORE.hours,
    })
    expect(view.entries?.length).toBeGreaterThan(0)
  })

  it("a cash order says how much to bring", () => {
    const view = emailView(
      "READY_FOR_PICKUP",
      input(f2({ paymentOption: "COD", paidAt: null }), { store: STORE })
    )
    expect(view.details).toContain(
      "Please bring ₱44,485.00 to pay when you pick it up."
    )
  })

  it("is a bug without the store's settings or the ready time", () => {
    expect(() => emailView("READY_FOR_PICKUP", input(f2()))).toThrow()
    expect(() =>
      emailView(
        "READY_FOR_PICKUP",
        input(f2({ readyAt: null }), { store: STORE })
      )
    ).toThrow()
  })

  it("E28: a Cancelled order adds a status line after the lead", () => {
    const view = emailView(
      "READY_FOR_PICKUP",
      input(f2({ status: "CANCELLED" }), { store: STORE })
    )
    expect(view.statusLine).toBe("Status: Cancelled")
    expect(view.lead).toBe("Your order PCS-4TN8V2HC is ready for pickup.")
  })
})

describe("emailView: ORDER_DELIVERED", () => {
  it("says it was delivered, with the time, courier and tracking", () => {
    const view = emailView("ORDER_DELIVERED", input(f3()))
    expect(view.subject).toBe("[Demo] Order PCS-7KQ2M9XD was delivered")
    expect(view.lead).toBe("Your order PCS-7KQ2M9XD was delivered.")
    expect(view.details).toEqual([
      "Delivered Tue 3 Nov 2026, 2:15 PM",
      `Courier: ${PARCEL.courier}`,
      `Tracking number: ${PARCEL.trackingNumber}`,
    ])
    expect(view.where).toBeNull()
    expect(view.totals).toBeNull()
    expect(view.action?.label).toBe(EMAIL_COPY.viewOrder)
  })

  it("is a bug without completedAt", () => {
    expect(() =>
      emailView("ORDER_DELIVERED", input(f3({ completedAt: null })))
    ).toThrow()
  })
})
