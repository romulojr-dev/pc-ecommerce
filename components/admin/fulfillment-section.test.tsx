import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { OrderDetail } from "@/lib/admin/queries/orders"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}))
vi.mock("@/app/admin/(shell)/orders/[number]/actions", () => ({
  transitionOrderAction: async () => ({ ok: false, message: "unused" }),
}))

import { OrderDetailView } from "./order-detail"

// docs/specs/043-order-fulfillment-transitions: B4, B11, B13, E17, E30, E30a
// on the order detail (the dialog itself is the E2E's)

const order = (over: Partial<OrderDetail> = {}): OrderDetail => ({
  orderNumber: "PCS-7K3M9Q2X",
  status: "PAID",
  dueForRelease: false,
  flags: { refundRequired: false, needsCheck: false },
  fulfillment: "DELIVERY",
  paymentOption: "ONLINE",
  paymentMethod: "GCASH",
  createdAt: new Date("2026-11-02T06:00:00Z"),
  expiresAt: new Date("2026-11-03T06:00:00Z"),
  paidAt: new Date("2026-11-02T06:10:00Z"),
  confirmedAt: null,
  processingAt: null,
  shippedAt: null,
  readyAt: null,
  completedAt: null,
  parcel: null,
  cancelledAt: null,
  cancelReason: null,
  contact: {
    masked: false,
    name: "Ana Reyes",
    email: "ana.reyes@example.com",
    mobile: "+639171234567",
  },
  customerKey: null,
  address: { kind: "pickup" },
  zone: null,
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

const NOW = new Date("2026-11-02T08:00:00Z")
const view = (o: OrderDetail, moveDisabledReason: string | null = null) =>
  renderToStaticMarkup(
    <OrderDetailView
      order={o}
      now={NOW}
      backHref="/admin/orders"
      slipHref="/slip"
      moveDisabledReason={moveDisabledReason}
    />
  )

describe("the Fulfillment section", () => {
  it("offers the one allowed move for the status", () => {
    const cases: [Partial<OrderDetail>, string][] = [
      [{ status: "PAID" }, "Start processing"],
      [{ status: "PROCESSING" }, "Mark as shipped"],
      [
        { status: "PROCESSING", fulfillment: "PICKUP" },
        "Mark as ready for pickup",
      ],
      [
        { status: "READY_FOR_PICKUP", fulfillment: "PICKUP" },
        "Mark as picked up",
      ],
      [{ status: "SHIPPED" }, "Mark as delivered"],
    ]
    for (const [patch, label] of cases) {
      const markup = view(order(patch))
      expect(markup).toContain("Fulfillment")
      expect(markup).toContain(label)
    }
  })

  it("a cash order that is COD confirmed also starts processing", () => {
    const markup = view(
      order({ status: "COD_CONFIRMED", paymentOption: "COD", paidAt: null })
    )
    expect(markup).toContain("Start processing")
  })

  it("B13: says why there is no button", () => {
    expect(view(order({ status: "PENDING_PAYMENT", paidAt: null }))).toContain(
      "Waiting for the customer. Cancel is the only change available."
    )
    const delivered = view(order({ status: "DELIVERED" }))
    expect(delivered).toContain("Delivered. Nothing more to do here.")
    expect(delivered).not.toContain("Mark as delivered")
    expect(view(order({ status: "REFUNDED" }))).toContain("Refunded.")
  })

  it("E17: Demo's button is disabled and says why", () => {
    const markup = view(order(), "This account is read-only")
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>Start processing/)
    expect(markup).toContain("This account is read-only")
  })

  it("E30: an owner sees the times, the courier and the whole tracking number", () => {
    const markup = view(
      order({
        status: "SHIPPED",
        processingAt: new Date("2026-11-02T07:00:00Z"),
        shippedAt: new Date("2026-11-02T07:30:00Z"),
        parcel: {
          masked: false,
          courier: "LBC",
          trackingNumber: "123456784821",
        },
      })
    )
    expect(markup).toContain("Processing started")
    expect(markup).toContain("Courier: LBC")
    expect(markup).toContain("Tracking number: 123456784821")
  })

  it("E30a: Demo sees the courier in full and the number masked", () => {
    const markup = view(
      order({
        status: "SHIPPED",
        shippedAt: new Date("2026-11-02T07:30:00Z"),
        parcel: {
          masked: true,
          courier: "LBC",
          trackingNumber: "•••• 4821" as never,
        },
      })
    )
    expect(markup).toContain("Courier: LBC")
    expect(markup).toContain("Tracking number: •••• 4821")
    expect(markup).not.toContain("123456784821")
  })

  it("labels completedAt from the fulfillment", () => {
    const completedAt = new Date("2026-11-03T06:15:00Z")
    expect(view(order({ status: "DELIVERED", completedAt }))).toContain(
      "Delivered Tue 3 Nov 2026"
    )
    expect(
      view(order({ status: "PICKED_UP", fulfillment: "PICKUP", completedAt }))
    ).toContain("Picked up Tue 3 Nov 2026")
  })
})
