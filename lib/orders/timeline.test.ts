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

// docs/specs/043-order-fulfillment-transitions: E24 to E26
describe("fulfillment times, courier and tracking (B20)", () => {
  // 2026-11-02 9:30 AM, 11:00 AM and 2026-11-03 2:15 PM in Manila
  const shippedAt = new Date("2026-11-02T01:30:00Z")
  const processingAt = new Date("2026-11-01T23:00:00Z")
  const completedAt = new Date("2026-11-03T06:15:00Z")
  const parcel = { courier: "LBC", trackingNumber: "123456784821" }

  it("E24: Shipped shows its time, the courier and the tracking number", () => {
    const { steps } = orderTimeline({
      status: "SHIPPED",
      fulfillment: "DELIVERY",
      processingAt,
      shippedAt,
      ...parcel,
    })
    const byStatus = Object.fromEntries(steps.map((s) => [s.status, s]))
    expect(byStatus.PROCESSING.detail).toBe("Started Mon 2 Nov 2026, 7:00 AM")
    expect(byStatus.SHIPPED.detail).toBe("Shipped Mon 2 Nov 2026, 9:30 AM")
    expect(byStatus.SHIPPED.lines).toEqual([
      "Courier: LBC",
      "Tracking number: 123456784821",
    ])
    // Delivered is still ahead
    expect(byStatus.DELIVERED.state).toBe("upcoming")
    expect(byStatus.DELIVERED.detail).toBeUndefined()
  })

  it("E25: a cash order picked up labels completedAt from its status", () => {
    const { steps } = orderTimeline({
      status: "PICKED_UP",
      fulfillment: "PICKUP",
      paymentOption: "COD",
      confirmedAt: new Date("2026-11-04T04:30:00Z"),
      readyAt: shippedAt,
      completedAt,
    })
    const last = steps[steps.length - 1]
    expect(last).toMatchObject({ status: "PICKED_UP", state: "current" })
    expect(last.detail).toBe("Picked up Tue 3 Nov 2026, 2:15 PM")
    expect(steps[1].detail).toBe("Confirmed Wed 4 Nov 2026, 12:30 PM")
    expect(steps[3].detail).toBe("Ready Mon 2 Nov 2026, 9:30 AM")
  })

  it("a delivery order's completedAt reads Delivered", () => {
    const { steps } = orderTimeline({
      status: "DELIVERED",
      fulfillment: "DELIVERY",
      shippedAt,
      completedAt,
      ...parcel,
    })
    expect(steps[steps.length - 1].detail).toBe(
      "Delivered Tue 3 Nov 2026, 2:15 PM"
    )
  })

  it("E26: a step with nothing stored shows nothing and is not an error", () => {
    const { steps } = orderTimeline({
      status: "SHIPPED",
      fulfillment: "DELIVERY",
    })
    expect(steps.every((s) => s.detail === undefined && !s.lines)).toBe(true)
    expect(steps.find((s) => s.state === "current")?.status).toBe("SHIPPED")
  })

  it("an online order never shows a time for a step it has not reached", () => {
    const { steps } = orderTimeline({
      status: "PROCESSING",
      fulfillment: "DELIVERY",
      processingAt,
      shippedAt,
      ...parcel,
    })
    expect(steps.find((s) => s.status === "SHIPPED")?.detail).toBeUndefined()
  })
})

// docs/specs/044-admin-cancel-order: B22, E25. The prior status isn't stored,
// so how far a cancelled order got comes from its timestamps.
describe("how far a cancelled order got", () => {
  const T = new Date("2026-11-04T04:30:00Z")
  const states = (o: Omit<Parameters<typeof orderTimeline>[0], "status">) =>
    orderTimeline({ ...o, status: "CANCELLED" }).steps.map(
      (s) => `${s.status}:${s.state}`
    )

  it("an unpaid online order stopped at Pending payment", () => {
    expect(states({ fulfillment: "DELIVERY" })).toEqual([
      "PENDING_PAYMENT:done",
      "PAID:upcoming",
      "PROCESSING:upcoming",
      "SHIPPED:upcoming",
      "DELIVERED:upcoming",
    ])
  })

  it("a paid online order got to Paid", () => {
    expect(states({ fulfillment: "DELIVERY", paidAt: T })).toEqual([
      "PENDING_PAYMENT:done",
      "PAID:done",
      "PROCESSING:upcoming",
      "SHIPPED:upcoming",
      "DELIVERED:upcoming",
    ])
  })

  it("a processing online order got to Processing, with its time", () => {
    const timeline = orderTimeline({
      status: "CANCELLED",
      fulfillment: "DELIVERY",
      paidAt: T,
      processingAt: T,
      cancelledAt: T,
    })
    expect(timeline.steps.map((s) => s.state)).toEqual([
      "done",
      "done",
      "done",
      "upcoming",
      "upcoming",
    ])
    expect(timeline.steps[2].detail).toMatch(/^Started /)
    expect(timeline.steps.some((s) => s.state === "current")).toBe(false)
    expect(timeline.branch).toMatchObject({
      status: "CANCELLED",
      detail: expect.stringMatching(/^Cancelled /),
    })
  })

  it("a confirmed cash order got to COD confirmed; an unconfirmed one to the first step", () => {
    expect(
      states({ fulfillment: "DELIVERY", paymentOption: "COD", confirmedAt: T })
    ).toEqual([
      "PENDING_CONFIRMATION:done",
      "COD_CONFIRMED:done",
      "PROCESSING:upcoming",
      "SHIPPED:upcoming",
      "DELIVERED:upcoming",
    ])
    expect(states({ fulfillment: "PICKUP", paymentOption: "COD" })[0]).toBe(
      "PENDING_CONFIRMATION:done"
    )
  })

  it("a pickup order that was ready got to Ready for pickup", () => {
    expect(
      states({
        fulfillment: "PICKUP",
        paymentOption: "COD",
        confirmedAt: T,
        processingAt: T,
        readyAt: T,
      })
    ).toEqual([
      "PENDING_CONFIRMATION:done",
      "COD_CONFIRMED:done",
      "PROCESSING:done",
      "READY_FOR_PICKUP:done",
      "PICKED_UP:upcoming",
    ])
  })

  it("a readyAt on a delivery order falls back to what the sequence has", () => {
    expect(states({ fulfillment: "DELIVERY", paidAt: T, readyAt: T })[2]).toBe(
      "PROCESSING:upcoming"
    )
  })
})
