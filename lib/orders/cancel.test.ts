import { describe, expect, it } from "vitest"

import { OrderStatus as OrderStatusEnum } from "@/generated/prisma/enums"

import {
  canCancel,
  CANCELLABLE_STATUSES,
  cancelInputSchema,
  cancelReasonLabel,
  cancelReasonPhrase,
  nothingReceived,
  STAFF_CANCEL_REASONS,
} from "./cancel"
import type {
  FulfillmentName,
  OrderStatusName,
  PaymentOptionName,
} from "./timeline"

const STATUSES = Object.values(OrderStatusEnum) as OrderStatusName[]
const FULFILLMENTS: FulfillmentName[] = ["DELIVERY", "PICKUP"]
const OPTIONS: PaymentOptionName[] = ["ONLINE", "COD"]

const ALLOWED = [
  "PENDING_PAYMENT",
  "PENDING_CONFIRMATION",
  "PAID",
  "COD_CONFIRMED",
  "PROCESSING",
  "READY_FOR_PICKUP",
]

describe("the cancel table (E1)", () => {
  it("allows exactly the six statuses, for every fulfillment and payment option", () => {
    let count = 0
    for (const status of STATUSES) {
      for (const fulfillment of FULFILLMENTS) {
        for (const paymentOption of OPTIONS) {
          count++
          expect(
            canCancel({ status, fulfillment, paymentOption }),
            `${status} ${fulfillment} ${paymentOption}`
          ).toBe(ALLOWED.includes(status))
        }
      }
    }
    expect(count).toBe(44)
  })

  it("refuses Shipped, Delivered, Picked up, Cancelled and Refunded", () => {
    for (const status of [
      "SHIPPED",
      "DELIVERED",
      "PICKED_UP",
      "CANCELLED",
      "REFUNDED",
    ] as const) {
      expect(canCancel({ status })).toBe(false)
    }
  })

  it("lists the cancellable statuses and covers every enum value", () => {
    expect([...CANCELLABLE_STATUSES].sort()).toEqual([...ALLOWED].sort())
    for (const status of STATUSES) {
      expect(typeof canCancel({ status })).toBe("boolean")
    }
  })
})

describe("the input (E13)", () => {
  const base = { orderNumber: "PCS-7KQ2M9XD", expectedStatus: "PAID" }
  const ok = (value: unknown) => cancelInputSchema.safeParse(value).success

  it("accepts each staff reason; Other needs a note", () => {
    expect(ok({ ...base, reason: "OUT_OF_STOCK" })).toBe(true)
    expect(ok({ ...base, reason: "CUSTOMER_REQUEST" })).toBe(true)
    expect(ok({ ...base, reason: "OTHER", note: "Wrong address" })).toBe(true)
    expect(ok({ ...base, reason: "OTHER" })).toBe(false)
    expect(ok({ ...base, reason: "OTHER", note: "  " })).toBe(false)
  })

  it("bounds the note to 3 to 200 characters and refuses line breaks", () => {
    expect(ok({ ...base, reason: "OTHER", note: "ab" })).toBe(false)
    expect(ok({ ...base, reason: "OTHER", note: "abc" })).toBe(true)
    expect(ok({ ...base, reason: "OTHER", note: "a".repeat(200) })).toBe(true)
    expect(ok({ ...base, reason: "OTHER", note: "a".repeat(201) })).toBe(false)
    expect(ok({ ...base, reason: "OTHER", note: "two\nlines" })).toBe(false)
  })

  it("refuses a note with another reason, EXPIRED, no reason and unknown values", () => {
    expect(ok({ ...base, reason: "OUT_OF_STOCK", note: "text" })).toBe(false)
    expect(ok({ ...base, reason: "EXPIRED" })).toBe(false)
    expect(ok(base)).toBe(false)
    expect(ok({ ...base, reason: "WHATEVER" })).toBe(false)
    expect(ok({ ...base, reason: "OTHER", note: "text", extra: 1 })).toBe(false)
    expect(ok({ ...base, orderNumber: "x", reason: "OUT_OF_STOCK" })).toBe(
      false
    )
  })

  it("has three staff reasons", () => {
    expect(STAFF_CANCEL_REASONS).toHaveLength(3)
  })
})

describe("reason phrases", () => {
  it("names the staff reasons and the expiry by payment option, none for Other", () => {
    expect(cancelReasonPhrase("OUT_OF_STOCK")).toBe(
      "one of the parts is out of stock"
    )
    expect(cancelReasonPhrase("CUSTOMER_REQUEST", "COD")).toBe(
      "you asked us to cancel it"
    )
    expect(cancelReasonPhrase("EXPIRED", "ONLINE")).toBe(
      "it wasn't paid in time"
    )
    expect(cancelReasonPhrase("EXPIRED", "COD")).toBe(
      "it wasn't confirmed in time"
    )
    expect(cancelReasonPhrase("OTHER")).toBeNull()
    expect(cancelReasonPhrase(null)).toBeNull()
    expect(cancelReasonPhrase("toString")).toBeNull()
  })

  it("labels every stored reason for Admin", () => {
    expect(cancelReasonLabel("OUT_OF_STOCK")).toBe("Out of stock")
    expect(cancelReasonLabel("EXPIRED", "COD")).toBe("Not confirmed in time")
    expect(cancelReasonLabel("EXPIRED")).toBe("Not paid in time")
    expect(cancelReasonLabel(null)).toBeNull()
  })
})

describe("nothing was received (E23, E24)", () => {
  const paid = new Date("2026-11-01T07:00:00Z")
  it("is true with no paidAt and no Paid payment", () => {
    expect(nothingReceived({ paidAt: null, payments: [] })).toBe(true)
    expect(
      nothingReceived({
        paidAt: null,
        payments: [{ status: "EXPIRED" }, { status: "FAILED" }],
      })
    ).toBe(true)
  })
  it("is false with paidAt, or with any Paid payment (late and second payments too)", () => {
    expect(nothingReceived({ paidAt: paid, payments: [] })).toBe(false)
    expect(
      nothingReceived({ paidAt: null, payments: [{ status: "PAID" }] })
    ).toBe(false)
  })
})
