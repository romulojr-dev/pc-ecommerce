import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  backHrefOf,
  backQueryOf,
  DEFAULT_ORDER_PARAMS,
} from "@/lib/admin/orders-params"
import type { OrderDetail } from "@/lib/admin/queries/orders"

import { OrderDetailView } from "./order-detail"
import { orderHref } from "./order-list"

// docs/specs/041-admin-orders-list-detail: B10–B14, E16, E18–E21, E26a

const NOW = new Date("2026-11-02T08:00:00Z")

const order = (over: Partial<OrderDetail> = {}): OrderDetail => ({
  orderNumber: "PCS-7K3M9Q2X",
  status: "PENDING_PAYMENT",
  dueForRelease: false,
  flags: { refundRequired: false, needsCheck: false },
  fulfillment: "DELIVERY",
  paymentOption: "ONLINE",
  paymentMethod: null,
  createdAt: new Date("2026-11-02T06:00:00Z"),
  expiresAt: new Date("2026-11-03T06:00:00Z"),
  paidAt: null,
  confirmedAt: null,
  cancelledAt: null,
  cancelReason: null,
  contact: {
    masked: false,
    name: "Ana Reyes",
    email: "ana.reyes@example.com",
    mobile: "+639171234567",
  },
  customerKey: "ana.reyes@example.com",
  address: {
    kind: "delivery",
    masked: false,
    regionName: "National Capital Region (NCR)",
    zone: "METRO_MANILA",
    street: "12 Mabini St",
    zip: "1100",
    barangayName: "Alicia",
    cityName: "Quezon City",
    provinceName: "Metro Manila",
  },
  zone: "METRO_MANILA",
  weightGrams: 900,
  items: [
    {
      name: "AMD Ryzen 5 7600X",
      unitPrice: 1_149_500,
      quantity: 2,
      buildId: null,
      slot: null,
    },
  ],
  subtotal: 2_299_000,
  shippingFee: 12_000,
  discount: 0,
  voucherCode: null,
  total: 2_311_000,
  payments: [],
  emails: [],
  ...over,
})

const view = (o: OrderDetail, slipHref: string | null = "/slip") =>
  renderToStaticMarkup(
    <OrderDetailView
      order={o}
      now={NOW}
      backHref="/admin/orders?status=PAID"
      slipHref={slipHref}
    />
  )

describe("the order detail", () => {
  it("shows the header, items, totals, contact, address and timeline", () => {
    const markup = view(order())
    expect(markup).toContain("PCS-7K3M9Q2X")
    expect(markup).toContain("Pending payment")
    expect(markup).toContain("AMD Ryzen 5 7600X")
    expect(markup).toContain("₱11,495.00 × 2")
    expect(markup).toContain("₱23,110.00")
    expect(markup).toContain("Ana Reyes")
    expect(markup).toContain("ana.reyes@example.com")
    expect(markup).toContain("+639171234567")
    expect(markup).toContain("12 Mabini St")
    expect(markup).toContain("Order weight 900 g")
    expect(markup).toContain("Placed ")
    expect(markup).toContain("Due ")
    expect(markup).toContain('aria-current="step"')
    expect(markup).toContain("No payment attempts.")
    expect(markup).toContain("No emails for this order.")
  })

  it("links back to the list as it was left, and to the slip", () => {
    const markup = view(order())
    expect(markup).toContain('href="/admin/orders?status=PAID"')
    expect(markup).toContain("Back to orders")
    expect(markup).toContain('href="/slip"')
    expect(view(order(), null)).not.toContain("Packing slip")
  })

  it("shows the voucher as Discount (CODE)", () => {
    const markup = view(
      order({
        voucherCode: "WELCOME10",
        discount: 229_900,
        total: 2_081_100,
      })
    )
    expect(markup).toContain("Discount (WELCOME10)")
  })

  it("E18: a build group is gathered, with its total", () => {
    const part = (slot: string, name: string) => ({
      name,
      unitPrice: 100_000,
      quantity: 1,
      buildId: "b1",
      slot,
    })
    const markup = view(
      order({
        items: [
          {
            name: "Kingston NV2",
            unitPrice: 100_000,
            quantity: 1,
            buildId: null,
            slot: null,
          },
          part("cpu", "AMD Ryzen 5 7600X"),
          part("motherboard", "ASUS PRIME B650M"),
        ],
      })
    )
    expect(markup).toContain("Kingston NV2")
    expect(markup).toContain("ASUS PRIME B650M")
    expect(markup).toContain("₱2,000.00")
  })

  it("E12: past its deadline it reads Pending payment, Due for release and Was due", () => {
    const markup = view(
      order({
        dueForRelease: true,
        expiresAt: new Date("2026-11-02T07:00:00Z"),
      })
    )
    expect(markup).toContain("Pending payment")
    expect(markup).toContain("Due for release")
    expect(markup).toContain("Was due ")
    expect(markup).not.toContain(">Cancelled<")
  })

  it("E16: the refund flag shows as a badge and a callout", () => {
    const markup = view(
      order({
        status: "CANCELLED",
        cancelledAt: new Date("2026-11-02T07:00:00Z"),
        cancelReason: "EXPIRED",
        flags: { refundRequired: true, needsCheck: false },
      })
    )
    expect(markup).toContain("Refund required")
    expect(markup).toContain(
      "a payment arrived after the order was cancelled, or a second payment arrived"
    )
    expect(markup).toContain("Not paid in time")
    expect(markup).not.toContain("Needs checking")
  })

  it("shows the needs-checking callout", () => {
    const markup = view(
      order({ flags: { refundRequired: false, needsCheck: true } })
    )
    expect(markup).toContain("Needs checking")
    expect(markup).toContain(
      "a payment&#x27;s amount didn&#x27;t match the order"
    )
  })

  it("E20: payment attempts with their problems and ids", () => {
    const markup = view(
      order({
        payments: [
          {
            referenceId: "PCS-7K3M9Q2X-2",
            provider: "XENDIT",
            status: "PAID",
            amount: 2_311_000,
            method: "GCASH",
            sessionId: "ps-abc",
            gatewayPaymentId: "py-abc",
            createdAt: new Date("2026-11-02T07:00:00Z"),
            paidAt: new Date("2026-11-02T07:05:00Z"),
            sessionExpiresAt: new Date("2026-11-03T07:00:00Z"),
            problem: "AMOUNT_MISMATCH",
            receivedAmount: 1_000,
          },
          {
            referenceId: "PCS-7K3M9Q2X-1",
            provider: "XENDIT",
            status: "FAILED",
            amount: 2_311_000,
            method: null,
            sessionId: null,
            gatewayPaymentId: null,
            createdAt: new Date("2026-11-02T06:30:00Z"),
            paidAt: null,
            sessionExpiresAt: new Date("2026-11-03T06:30:00Z"),
            problem: null,
            receivedAmount: null,
          },
        ],
      })
    )
    expect(markup).toContain("PCS-7K3M9Q2X-2")
    expect(markup).toContain("ps-abc")
    expect(markup).toContain("py-abc")
    expect(markup).toContain("Amount didn&#x27;t match (Received ₱10.00)")
    expect(markup).toContain("Failed")
    expect(markup).not.toContain("No payment attempts.")
  })

  it("E21: emails show type, status and code", () => {
    const markup = view(
      order({
        emails: [
          {
            type: "PAYMENT_RECEIVED",
            status: "FAILED",
            attempts: 2,
            lastErrorCode: "timeout",
            sentAt: null,
            createdAt: new Date("2026-11-02T07:00:00Z"),
          },
        ],
      })
    )
    expect(markup).toContain("Payment received")
    expect(markup).toContain("Failed")
    expect(markup).toContain("timeout")
  })
})

describe("cash orders", () => {
  const cod = (over: Partial<OrderDetail> = {}) =>
    order({
      status: "COD_CONFIRMED",
      paymentOption: "COD",
      total: 4_199_000,
      ...over,
    })

  it("E26a: the amount to collect is prominent", () => {
    const markup = view(cod())
    expect(markup).toContain("Amount to collect ₱41,990.00 on delivery")
    expect(markup).toContain("Cash on delivery, no online payment")
    expect(markup).not.toContain("No payment attempts.")
  })

  it("says on pickup for a pickup order", () => {
    const markup = view(
      cod({ fulfillment: "PICKUP", address: { kind: "pickup" }, zone: null })
    )
    expect(markup).toContain("Amount to collect ₱41,990.00 on pickup")
    expect(markup).toContain("Pay on pickup, no online payment")
    expect(markup).toContain("Store pickup")
  })

  it("is gone once delivered and paid", () => {
    expect(view(cod({ status: "DELIVERED", paidAt: NOW }))).not.toContain(
      "Amount to collect"
    )
  })

  it("an online order never shows it", () => {
    expect(view(order())).not.toContain("Amount to collect")
  })
})

describe("Demo", () => {
  it("E23: shows only what the DTO holds", () => {
    const markup = view(
      order({
        customerKey: "c1",
        contact: {
          masked: true,
          name: "A••• R•••" as never,
          email: "a•••@••••.•••" as never,
          mobile: "+63•••••••••" as never,
        },
        address: {
          kind: "delivery",
          masked: true,
          regionName: "National Capital Region (NCR)",
          zone: "METRO_MANILA",
        },
      })
    )
    expect(markup).toContain("A••• R•••")
    expect(markup).toContain("National Capital Region (NCR)")
    for (const raw of ["Ana", "Reyes", "example.com", "9171234567", "Mabini"]) {
      expect(markup).not.toContain(raw)
    }
  })
})

describe("the back link", () => {
  it("round-trips the list's filters and page", () => {
    const params = {
      ...DEFAULT_ORDER_PARAMS,
      status: "PAID" as const,
      number: "7k3m",
      page: 2,
    }
    const href = orderHref("PCS-7K3M9Q2X", params)
    const back = new URL(href, "https://x.test").searchParams.get("back")
    expect(backQueryOf(params)).toBe(back)
    expect(backHrefOf(back ?? undefined)).toBe(
      "/admin/orders?status=PAID&number=7k3m&page=2"
    )
  })

  it("has no back parameter for the default list", () => {
    expect(orderHref("PCS-7K3M9Q2X", DEFAULT_ORDER_PARAMS)).toBe(
      "/admin/orders/PCS-7K3M9Q2X"
    )
    expect(backHrefOf(undefined)).toBe("/admin/orders")
  })

  it("can only ever name the list", () => {
    for (const value of [
      "https://evil.test",
      "//evil.test",
      "/admin/users",
      "status=BOGUS&page=-1&x=1",
      "javascript:alert(1)",
    ]) {
      expect(backHrefOf(value), value).toBe("/admin/orders")
    }
    expect(backHrefOf(["status=PAID", "status=SHIPPED"])).toBe(
      "/admin/orders?status=PAID"
    )
  })
})

describe("the customer link (docs/specs/042-admin-customers, B15, E30, E31)", () => {
  it("links to the customer's orders by the key", () => {
    expect(view(order())).toContain(
      'href="/admin/orders?buyer=ana.reyes%40example.com"'
    )
    expect(view(order())).toContain("View this customer&#x27;s orders")
  })

  it("Demo's link carries the rank key, not the email", () => {
    const markup = view(
      order({
        customerKey: "c3",
        contact: {
          masked: true,
          name: "A••• R•••" as never,
          email: "a•••@••••.•••" as never,
          mobile: "+63•••••••••" as never,
        },
      })
    )
    expect(markup).toContain('href="/admin/orders?buyer=c3"')
    expect(markup).not.toContain("ana.reyes")
  })

  it("no key, no link", () => {
    expect(view(order({ customerKey: null }))).not.toContain(
      "View this customer"
    )
  })
})
