import { describe, expect, it } from "vitest"

import { ADMIN_COPY } from "./copy"
import { ORDER_STATUSES } from "./orders-params"
import {
  amountToCollect,
  EMAIL_STATUS_LABELS,
  EMAIL_TYPE_LABELS,
  PAYMENT_PROBLEM_LABELS,
  PAYMENT_STATUS_LABELS,
  paymentCell,
  readyToPack,
  slipEntries,
  slipPaymentLine,
  slipWarning,
} from "./orders-view"

// docs/specs/041-admin-orders-list-detail: E26, E26a, §5

const LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Pending payment",
  PENDING_CONFIRMATION: "Pending confirmation",
  PAID: "Paid",
  COD_CONFIRMED: "COD confirmed",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  READY_FOR_PICKUP: "Ready for pickup",
  DELIVERED: "Delivered",
  PICKED_UP: "Picked up",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
}

describe("E26: ready to pack is Processing only", () => {
  it.each(ORDER_STATUSES)("%s", (status) => {
    if (status === "PROCESSING") {
      expect(readyToPack(status)).toBe(true)
      expect(slipWarning(status)).toBeNull()
    } else {
      expect(readyToPack(status)).toBe(false)
      expect(slipWarning(status)).toBe(
        `Do not ship: this order is ${LABELS[status]}.`
      )
    }
  })
})

describe("paymentCell", () => {
  const base = { fulfillment: "DELIVERY", paymentMethod: null } as const
  it("names the channel once paid", () => {
    const online = { ...base, paymentOption: "ONLINE" } as const
    expect(paymentCell(online)).toBe("Online")
    expect(paymentCell({ ...online, paymentMethod: "GCASH" })).toBe(
      "Online (GCash)"
    )
    expect(paymentCell({ ...online, paymentMethod: "PAYMAYA" })).toBe(
      "Online (Maya)"
    )
    expect(paymentCell({ ...online, paymentMethod: "CARDS" })).toBe(
      "Online (Card)"
    )
    expect(paymentCell({ ...online, paymentMethod: "FAKE" })).toBe("Online")
  })

  it("says cash on delivery or pay on pickup", () => {
    expect(paymentCell({ ...base, paymentOption: "COD" })).toBe(
      "Cash on delivery"
    )
    expect(
      paymentCell({ ...base, paymentOption: "COD", fulfillment: "PICKUP" })
    ).toBe("Pay on pickup")
  })
})

describe("E26a: amount to collect", () => {
  const cod = {
    paymentOption: "COD",
    fulfillment: "DELIVERY",
    status: "COD_CONFIRMED",
    paidAt: null,
    total: 4_199_000,
  } as const

  it("shows the total for a cash order not yet delivered", () => {
    expect(amountToCollect(cod)).toBe(
      "Amount to collect ₱41,990.00 on delivery"
    )
    expect(amountToCollect({ ...cod, fulfillment: "PICKUP" })).toBe(
      "Amount to collect ₱41,990.00 on pickup"
    )
  })

  it("is gone once paid, cancelled, refunded, or for an online order", () => {
    expect(amountToCollect({ ...cod, paidAt: new Date() })).toBeNull()
    expect(amountToCollect({ ...cod, status: "CANCELLED" })).toBeNull()
    expect(amountToCollect({ ...cod, status: "REFUNDED" })).toBeNull()
    expect(amountToCollect({ ...cod, paymentOption: "ONLINE" })).toBeNull()
  })
})

describe("slipPaymentLine: never an amount (D6)", () => {
  it("covers online and cash", () => {
    const o = { fulfillment: "DELIVERY", paidAt: null } as const
    expect(slipPaymentLine({ ...o, paymentOption: "ONLINE" })).toBe(
      "Not yet paid"
    )
    expect(
      slipPaymentLine({ ...o, paymentOption: "ONLINE", paidAt: new Date() })
    ).toBe("Paid online")
    expect(slipPaymentLine({ ...o, paymentOption: "COD" })).toBe(
      "Collect payment"
    )
    expect(
      slipPaymentLine({ ...o, paymentOption: "COD", fulfillment: "PICKUP" })
    ).toBe("Collect payment on pickup")
    for (const paymentOption of ["ONLINE", "COD"] as const) {
      expect(slipPaymentLine({ ...o, paymentOption })).not.toMatch(/₱|\d/)
    }
  })
})

describe("labels", () => {
  it("cover every payment problem, payment status, email type and status", () => {
    expect(Object.keys(PAYMENT_PROBLEM_LABELS)).toHaveLength(3)
    expect(Object.keys(PAYMENT_STATUS_LABELS)).toHaveLength(5)
    expect(Object.keys(EMAIL_TYPE_LABELS)).toHaveLength(4)
    expect(Object.keys(EMAIL_STATUS_LABELS)).toHaveLength(5)
    expect(PAYMENT_PROBLEM_LABELS.AMOUNT_MISMATCH).toBe("Amount didn't match")
    expect(EMAIL_STATUS_LABELS.PENDING).toBe("Queued")
  })

  it("the count and page text read naturally", () => {
    expect(ADMIN_COPY.orders.count(1)).toBe("1 order")
    expect(ADMIN_COPY.orders.count(30)).toBe("30 orders")
    expect(ADMIN_COPY.orders.pageOf(1, 2)).toBe("Page 1 of 2")
  })
})

describe("slipEntries", () => {
  const line = (name: string, buildId: string | null, slot: string | null) => ({
    name,
    quantity: 1,
    buildId,
    slot,
  })

  it("keeps a single line a line and gathers a build where it began", () => {
    const entries = slipEntries([
      line("SSD", null, null),
      line("CPU", "b1", "cpu"),
      line("Fan", null, null),
      line("Board", "b1", "motherboard"),
    ])
    expect(entries.map((e) => e.kind)).toEqual(["single", "build", "single"])
    const group = entries[1]
    expect(group.kind === "build" && group.parts.map((p) => p.name)).toEqual([
      "CPU",
      "Board",
    ])
    expect(group.kind === "build" && group.number).toBeNull()
  })

  it("numbers the groups only when there are two or more", () => {
    const entries = slipEntries([
      line("CPU", "b1", "cpu"),
      line("CPU 2", "b2", "cpu"),
    ])
    expect(entries.map((e) => e.kind === "build" && e.number)).toEqual([1, 2])
  })

  it("carries no price", () => {
    const [entry] = slipEntries([line("SSD", null, null)])
    expect(JSON.stringify(entry)).not.toMatch(/price/i)
  })
})
