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

describe("COD confirmed", () => {
  it("shares Paid's place until Sprint 7", () => {
    expect(states("COD_CONFIRMED", "DELIVERY")[1]).toBe("Paid:current")
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
})
