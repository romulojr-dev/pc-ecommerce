import { describe, expect, it } from "vitest"

import type { OrderStatus } from "@/generated/prisma/client"
import { OrderStatus as OrderStatusEnum } from "@/generated/prisma/enums"

import type {
  FulfillmentName,
  OrderStatusName,
  PaymentOptionName,
} from "./timeline"
import {
  canTransition,
  emailTypeFor,
  isTransitionTarget,
  recordsCashPayment,
  TIMESTAMP_FIELD,
  TRANSITION_TARGETS,
  transitionsFor,
} from "./transitions"

const STATUSES = Object.values(OrderStatusEnum) as OrderStatus[]
const FULFILLMENTS: FulfillmentName[] = ["DELIVERY", "PICKUP"]
const OPTIONS: PaymentOptionName[] = ["ONLINE", "COD"]

// B1 written out, the contract the function is checked against
const EXPECTED: Record<string, string> = {
  "PAID|DELIVERY|ONLINE": "PROCESSING",
  "PAID|PICKUP|ONLINE": "PROCESSING",
  "COD_CONFIRMED|DELIVERY|COD": "PROCESSING",
  "COD_CONFIRMED|PICKUP|COD": "PROCESSING",
  "PROCESSING|DELIVERY|ONLINE": "SHIPPED",
  "PROCESSING|DELIVERY|COD": "SHIPPED",
  "PROCESSING|PICKUP|ONLINE": "READY_FOR_PICKUP",
  "PROCESSING|PICKUP|COD": "READY_FOR_PICKUP",
  "READY_FOR_PICKUP|PICKUP|ONLINE": "PICKED_UP",
  "READY_FOR_PICKUP|PICKUP|COD": "PICKED_UP",
  "SHIPPED|DELIVERY|ONLINE": "DELIVERED",
  "SHIPPED|DELIVERY|COD": "DELIVERED",
}

describe("the transition table", () => {
  it("E1: covers every status, fulfillment and payment option", () => {
    expect(STATUSES).toHaveLength(11)
    let combinations = 0
    for (const status of STATUSES) {
      for (const fulfillment of FULFILLMENTS) {
        for (const paymentOption of OPTIONS) {
          combinations++
          const key = `${status}|${fulfillment}|${paymentOption}`
          const expected = EXPECTED[key]
          expect(
            transitionsFor({ status, fulfillment, paymentOption }),
            key
          ).toEqual(expected ? [expected] : [])
        }
      }
    }
    expect(combinations).toBe(44)
  })

  it("E1: staff can never reach Paid, COD confirmed, a pending status, Cancelled or Refunded", () => {
    const forbidden: OrderStatusName[] = [
      "PAID",
      "COD_CONFIRMED",
      "PENDING_PAYMENT",
      "PENDING_CONFIRMATION",
      "CANCELLED",
      "REFUNDED",
    ]
    for (const status of STATUSES) {
      for (const fulfillment of FULFILLMENTS) {
        for (const paymentOption of OPTIONS) {
          for (const to of transitionsFor({
            status,
            fulfillment,
            paymentOption,
          })) {
            expect(forbidden).not.toContain(to)
          }
        }
      }
    }
    expect([...TRANSITION_TARGETS].sort()).toEqual(
      [
        "DELIVERED",
        "PICKED_UP",
        "PROCESSING",
        "READY_FOR_PICKUP",
        "SHIPPED",
      ].sort()
    )
  })

  it("E14: forged targets are refused", () => {
    const processing = {
      status: "PROCESSING",
      fulfillment: "DELIVERY",
      paymentOption: "ONLINE",
    } as const
    for (const to of [
      "PAID",
      "CANCELLED",
      "DELIVERED",
      "READY_FOR_PICKUP",
      "",
    ]) {
      expect(canTransition(processing, to)).toBe(false)
    }
    // Shipped is not offered for a pickup order
    expect(
      canTransition({ ...processing, fulfillment: "PICKUP" }, "SHIPPED")
    ).toBe(false)
    expect(canTransition(processing, "SHIPPED")).toBe(true)
  })

  it("has no move out of a terminal or pending status (E15, E16)", () => {
    for (const status of [
      "PENDING_PAYMENT",
      "PENDING_CONFIRMATION",
      "DELIVERED",
      "PICKED_UP",
      "CANCELLED",
      "REFUNDED",
    ] as const) {
      expect(
        transitionsFor({
          status,
          fulfillment: "DELIVERY",
          paymentOption: "ONLINE",
        })
      ).toEqual([])
    }
  })

  it("never offers more than one move", () => {
    for (const status of STATUSES) {
      for (const fulfillment of FULFILLMENTS) {
        for (const paymentOption of OPTIONS) {
          expect(
            transitionsFor({ status, fulfillment, paymentOption }).length
          ).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})

describe("what a move does", () => {
  it("sends an email for Shipped, Ready for pickup and Delivered only", () => {
    expect(emailTypeFor("PROCESSING")).toBeNull()
    expect(emailTypeFor("SHIPPED")).toBe("ORDER_SHIPPED")
    expect(emailTypeFor("READY_FOR_PICKUP")).toBe("READY_FOR_PICKUP")
    expect(emailTypeFor("DELIVERED")).toBe("ORDER_DELIVERED")
    expect(emailTypeFor("PICKED_UP")).toBeNull()
  })

  it("records cash as paid at hand-over, for cash orders only", () => {
    expect(recordsCashPayment({ paymentOption: "COD" }, "DELIVERED")).toBe(true)
    expect(recordsCashPayment({ paymentOption: "COD" }, "PICKED_UP")).toBe(true)
    expect(recordsCashPayment({ paymentOption: "COD" }, "SHIPPED")).toBe(false)
    expect(recordsCashPayment({ paymentOption: "COD" }, "PROCESSING")).toBe(
      false
    )
    expect(recordsCashPayment({ paymentOption: "ONLINE" }, "DELIVERED")).toBe(
      false
    )
    expect(recordsCashPayment({ paymentOption: "ONLINE" }, "PICKED_UP")).toBe(
      false
    )
  })

  it("stamps one column per move, completedAt for both hand-overs", () => {
    expect(TIMESTAMP_FIELD).toEqual({
      PROCESSING: "processingAt",
      SHIPPED: "shippedAt",
      READY_FOR_PICKUP: "readyAt",
      DELIVERED: "completedAt",
      PICKED_UP: "completedAt",
    })
    expect(isTransitionTarget("SHIPPED")).toBe(true)
    expect(isTransitionTarget("PAID")).toBe(false)
  })
})
