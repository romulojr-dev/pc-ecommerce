import { describe, expect, it } from "vitest"

import {
  type FulfillmentName,
  type OrderStatusName,
  orderTimeline,
  statusLabel,
} from "./timeline"

// docs/specs/030-place-an-order: V10 and V7's timeline

const states = (status: OrderStatusName, fulfillment: FulfillmentName) =>
  orderTimeline({ status, fulfillment }).steps.map(
    (step) => `${step.label}:${step.state}`
  )

describe("a delivery order", () => {
  it("starts at Pending payment", () => {
    expect(states("PENDING_PAYMENT", "DELIVERY")).toEqual([
      "Pending payment:current",
      "Paid:upcoming",
      "Processing:upcoming",
      "Shipped:upcoming",
      "Delivered:upcoming",
    ])
  })

  it.each([
    ["PAID", 1],
    ["PROCESSING", 2],
    ["SHIPPED", 3],
    ["DELIVERED", 4],
  ] as const)("%s moves the current step to %i", (status, index) => {
    const steps = orderTimeline({ status, fulfillment: "DELIVERY" }).steps
    steps.forEach((step, i) => {
      expect(step.state).toBe(
        i < index ? "done" : i === index ? "current" : "upcoming"
      )
    })
  })
})

describe("a pickup order", () => {
  it("ends in Ready for pickup and Picked up", () => {
    expect(states("PENDING_PAYMENT", "PICKUP")).toEqual([
      "Pending payment:current",
      "Paid:upcoming",
      "Processing:upcoming",
      "Ready for pickup:upcoming",
      "Picked up:upcoming",
    ])
    expect(states("READY_FOR_PICKUP", "PICKUP")[3]).toBe(
      "Ready for pickup:current"
    )
    expect(states("PICKED_UP", "PICKUP")[4]).toBe("Picked up:current")
  })
})

// docs/specs/038-cash-on-delivery: U10, U11
const cod = (
  status: OrderStatusName,
  fulfillment: FulfillmentName,
  confirmedAt: Date | null = null
) => orderTimeline({ status, fulfillment, paymentOption: "COD", confirmedAt })

const codStates = (
  status: OrderStatusName,
  fulfillment: FulfillmentName,
  confirmedAt: Date | null = null
) =>
  cod(status, fulfillment, confirmedAt).steps.map(
    (step) => `${step.label}:${step.state}`
  )

describe("a cash order", () => {
  it("U10: delivery runs Pending confirmation to Delivered", () => {
    expect(codStates("PENDING_CONFIRMATION", "DELIVERY")).toEqual([
      "Pending confirmation:current",
      "COD confirmed:upcoming",
      "Processing:upcoming",
      "Shipped:upcoming",
      "Delivered:upcoming",
    ])
  })

  it("U10: pickup ends in Ready for pickup and Picked up", () => {
    expect(codStates("COD_CONFIRMED", "PICKUP")).toEqual([
      "Pending confirmation:done",
      "COD confirmed:current",
      "Processing:upcoming",
      "Ready for pickup:upcoming",
      "Picked up:upcoming",
    ])
    expect(codStates("PICKED_UP", "PICKUP")[4]).toBe("Picked up:current")
  })

  it.each([
    ["PENDING_CONFIRMATION", 0],
    ["COD_CONFIRMED", 1],
    ["PROCESSING", 2],
    ["SHIPPED", 3],
    ["DELIVERED", 4],
  ] as const)("U10: %s makes step %i current", (status, index) => {
    cod(status, "DELIVERY").steps.forEach((step, i) => {
      expect(step.state).toBe(
        i < index ? "done" : i === index ? "current" : "upcoming"
      )
    })
  })

  it("U10: Cancelled leaves Pending confirmation done and no step current", () => {
    const timeline = cod("CANCELLED", "DELIVERY")
    expect(timeline.branch).toEqual({ status: "CANCELLED", label: "Cancelled" })
    expect(timeline.steps.map((s) => s.state)).toEqual([
      "done",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ])
  })

  it("U10: the COD confirmed step reads the time it was confirmed", () => {
    // 2026-11-04 12:30 in Manila
    const confirmedAt = new Date("2026-11-04T04:30:00Z")
    const steps = cod("COD_CONFIRMED", "DELIVERY", confirmedAt).steps
    expect(steps[1].detail).toBe("Confirmed Wed 4 Nov 2026, 12:30 PM")
    // later statuses keep it on the same step; no other step has one
    const later = cod("SHIPPED", "DELIVERY", confirmedAt).steps
    expect(later.map((s) => s.detail)).toEqual([
      undefined,
      "Confirmed Wed 4 Nov 2026, 12:30 PM",
      undefined,
      undefined,
      undefined,
    ])
  })

  it("U10: no time without confirmedAt, and none before the step is reached", () => {
    expect(
      cod("COD_CONFIRMED", "DELIVERY", null).steps.every((s) => !s.detail)
    ).toBe(true)
    const confirmedAt = new Date("2026-11-04T04:30:00Z")
    expect(
      cod("PENDING_CONFIRMATION", "DELIVERY", confirmedAt).steps.every(
        (s) => !s.detail
      )
    ).toBe(true)
  })

  it("U11: an online order's timeline is unchanged and never shows a time", () => {
    expect(states("PAID", "DELIVERY")[1]).toBe("Paid:current")
    expect(
      orderTimeline({
        status: "PAID",
        fulfillment: "DELIVERY",
        confirmedAt: new Date("2026-11-04T04:30:00Z"),
      }).steps.every((s) => !s.detail)
    ).toBe(true)
  })
})

describe("the Cancelled and Refunded branches", () => {
  it("Cancelled is its own item and no step is current", () => {
    const timeline = orderTimeline({
      status: "CANCELLED",
      fulfillment: "DELIVERY",
    })
    expect(timeline.branch).toEqual({ status: "CANCELLED", label: "Cancelled" })
    expect(timeline.steps.some((step) => step.state === "current")).toBe(false)
    expect(timeline.steps[0].state).toBe("done")
    expect(timeline.steps.slice(1).every((s) => s.state === "upcoming")).toBe(
      true
    )
  })

  it("Refunded follows a payment", () => {
    const timeline = orderTimeline({
      status: "REFUNDED",
      fulfillment: "PICKUP",
    })
    expect(timeline.branch).toEqual({ status: "REFUNDED", label: "Refunded" })
    expect(timeline.steps.map((s) => s.state)).toEqual([
      "done",
      "done",
      "upcoming",
      "upcoming",
      "upcoming",
    ])
  })

  it("other statuses have no branch", () => {
    expect(
      orderTimeline({ status: "PAID", fulfillment: "DELIVERY" }).branch
    ).toBeNull()
  })
})

it("labels every status", () => {
  expect(statusLabel("PENDING_PAYMENT")).toBe("Pending payment")
  expect(statusLabel("READY_FOR_PICKUP")).toBe("Ready for pickup")
  // U11: COD confirmed is its own label, no longer "Paid"
  expect(statusLabel("COD_CONFIRMED")).toBe("COD confirmed")
  expect(statusLabel("PENDING_CONFIRMATION")).toBe("Pending confirmation")
})
