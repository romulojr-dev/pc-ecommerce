import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { OrderStatusName } from "@/lib/orders/timeline"
import type { OrderPageData, OrderPageItem } from "@/lib/orders/view"
import { FAKE_INSTRUCTIONS, XENDIT_INSTRUCTIONS } from "@/lib/payments/copy"
import { paymentView } from "@/lib/payments/payment-view"
import type { PaymentParam } from "@/lib/payments/session-request"

import { OrderView } from "./order-view"

// docs/specs/030-place-an-order: V1, V7–V11, V16 as markup (the access rules
// are in lib/orders/get-order.db.test.ts); docs/specs/031-pay-with-xendit:
// V1–V9 of the payment area, computed as the page does

// The payment panel is a client component; the server render needs no router
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, replace: () => {} }),
}))
vi.mock("@/app/(store)/orders/[number]/actions", () => ({
  startPaymentAction: async () => ({ ok: false, reason: "error" }),
}))

const NOW = new Date("2026-10-31T08:00:00Z")

const ryzen: OrderPageItem = {
  name: "AMD Ryzen 5 7600",
  unitPrice: 1_149_500,
  quantity: 2,
  buildId: null,
  slot: null,
}

const part = (
  slot: string,
  name: string,
  unitPrice: number,
  buildId = "b1"
): OrderPageItem => ({ name, unitPrice, quantity: 1, buildId, slot })

function order(over: Partial<OrderPageData> = {}): OrderPageData {
  return {
    orderNumber: "PCS-7K3M9QXZ",
    status: "PENDING_PAYMENT",
    fulfillment: "DELIVERY",
    createdAt: new Date("2026-10-31T07:42:00Z"),
    // 24 hours later
    expiresAt: new Date("2026-11-01T07:42:00Z"),
    contact: {
      name: "Ana Santos",
      email: "ana@example.com",
      mobile: "+639171234567",
    },
    address: {
      street: "12 Mabini St",
      barangay: "Alicia",
      city: "Quezon City",
      province: "Metro Manila",
      region: "National Capital Region (NCR)",
      zip: "1100",
    },
    store: null,
    items: [ryzen],
    subtotal: 2_299_000,
    shippingFee: 12_000,
    discount: 0,
    total: 2_311_000,
    paidAt: null,
    paymentMethod: null,
    refundRequired: false,
    payments: { latest: null, needsCheck: false },
    ...over,
  }
}

const render = (
  o: OrderPageData,
  now = NOW,
  param: PaymentParam | null = null,
  instructions = XENDIT_INSTRUCTIONS
) =>
  renderToStaticMarkup(
    <OrderView
      order={o}
      payment={{
        view: paymentView(o.status, o.expiresAt, param, now, o.payments),
        instructions,
        gatewayName: "Xendit",
      }}
    />
  )

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")

describe("V1: a delivery order awaiting payment", () => {
  const html = render(order())

  it("names the order and when it was placed", () => {
    expect(html).toContain("Order PCS-7K3M9QXZ")
    expect(text(html)).toContain("Placed on Sat 31 Oct 2026")
  })

  it("has Pending payment as the current step, and nothing else current", () => {
    expect(html.match(/aria-current="step"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-current="step"[^>]*>[\s\S]*?Pending payment/)
    expect(html).toContain('aria-label="Order status"')
  })

  it("shows the pay-by time and Pay now (spec 031, V1)", () => {
    expect(text(html)).toContain("Pay by Sun 1 Nov 2026, 3:42 PM")
    expect(html).toMatch(/<button[^>]*>Pay now<\/button>/)
    expect(text(html)).not.toContain("Paying online is coming soon.")
  })

  it("shows the save-the-link prompt with the copy button", () => {
    expect(text(html)).toContain(
      "Save this link: it's the only way to see your order until order emails arrive."
    )
    expect(html).toContain("Copy link")
    expect(html).toContain("Your order link")
  })

  it("shows the item from its snapshot, and the totals", () => {
    const t = text(html)
    expect(t).toContain("AMD Ryzen 5 7600")
    expect(t).toContain("₱11,495.00 × 2")
    expect(t).toContain("₱22,990.00")
    expect(t).toContain("Subtotal ₱22,990.00")
    expect(t).toContain("Shipping ₱120.00")
    expect(t).toContain("Total ₱23,110.00")
    expect(t).not.toContain("Discount")
  })

  it("shows the street, then the places", () => {
    const t = text(html)
    expect(t).toContain("Delivery address")
    expect(t).toContain("12 Mabini St")
    expect(t).toContain(
      "Alicia, Quezon City, Metro Manila, National Capital Region (NCR) 1100"
    )
    expect(t).toContain("+639171234567")
  })
})

describe("V7: a pickup order", () => {
  const html = render(
    order({
      fulfillment: "PICKUP",
      address: null,
      store: {
        address: "PC Silicon Demo Store\nQuezon City",
        hours: "Mon–Sat 10:00 AM–7:00 PM",
      },
      shippingFee: 0,
      total: 2_299_000,
    })
  )

  it("shows the store, the ID reminder and a free pickup", () => {
    const t = text(html)
    expect(t).toContain("Pick up at")
    expect(t).toContain("PC Silicon Demo Store")
    expect(t).toContain("Mon–Sat 10:00 AM–7:00 PM")
    expect(t).toContain(
      "Bring your order number and a valid ID when you collect your order."
    )
    expect(t).toContain("Shipping Free (pickup)")
    expect(t).not.toContain("Delivery address")
  })

  it("ends its timeline in Ready for pickup and Picked up", () => {
    const t = text(html)
    expect(t.indexOf("Ready for pickup")).toBeGreaterThan(-1)
    expect(t.indexOf("Picked up")).toBeGreaterThan(
      t.indexOf("Ready for pickup")
    )
    expect(t).not.toContain("Shipped")
  })
})

describe("V8, V9: build groups", () => {
  const cpu = part("cpu", "AMD Ryzen 5 7600", 1_149_500)
  const gpu = part(
    "gpu",
    "ASUS Dual GeForce RTX 4060 OC Edition 8GB",
    1_799_500
  )

  it("V8: a single line and one unnumbered group, parts with slot labels", () => {
    const t = text(
      render(order({ items: [{ ...ryzen, quantity: 1 }, cpu, gpu] }))
    )
    expect(t).toContain("Custom PC build ₱29,490.00")
    expect(t).not.toContain("Custom PC build 1")
    expect(t.indexOf("Graphics Card")).toBeGreaterThan(t.indexOf("CPU"))
    expect(t).toContain("ASUS Dual GeForce RTX 4060 OC Edition 8GB")
  })

  it("V9: two groups are numbered", () => {
    const t = text(
      render(
        order({
          items: [cpu, gpu, part("cpu", "Intel Core i5-14400F", 929_500, "b2")],
        })
      )
    )
    expect(t).toContain("Custom PC build 1")
    expect(t).toContain("Custom PC build 2")
  })
})

describe("V10: every status", () => {
  const current = (
    status: OrderStatusName,
    over: Partial<OrderPageData> = {}
  ) => {
    const html = render(order({ status, ...over }))
    return [...html.matchAll(/aria-current="step"[^>]*>([\s\S]*?)<\/li>/g)].map(
      (match) => text(match[1]).trim()
    )
  }

  it.each([
    ["PAID", "Paid"],
    ["PROCESSING", "Processing"],
    ["SHIPPED", "Shipped"],
    ["DELIVERED", "Delivered"],
    ["CANCELLED", "Cancelled"],
    ["REFUNDED", "Refunded"],
  ] as const)("%s makes %s the current item", (status, label) => {
    expect(current(status)).toEqual([label])
  })

  it("hides the pay-by line once the order is paid or cancelled", () => {
    for (const status of [
      "PAID",
      "CANCELLED",
      "REFUNDED",
      "SHIPPED",
    ] as const) {
      const t = text(render(order({ status })))
      expect(t).not.toContain("Pay by")
      expect(t).not.toContain("Paying online")
    }
  })

  it("shows a Discount line only above zero", () => {
    const t = text(render(order({ discount: 100_000, total: 2_211_000 })))
    expect(t).toContain("Discount −₱1,000.00")
  })
})

describe("V11: past the payment time", () => {
  it("says so and drops the pay-by line", () => {
    const t = text(render(order(), new Date("2026-11-01T07:42:00Z")))
    expect(t).toContain(
      "The time to pay has passed. This order will be cancelled and its parts released."
    )
    expect(t).not.toContain("Pay by")
  })

  it("still shows pay-by a second before the deadline", () => {
    const t = text(render(order(), new Date("2026-11-01T07:41:59Z")))
    expect(t).toContain("Pay by Sun 1 Nov 2026, 3:42 PM")
  })
})

describe("V16b: a deadline that crosses midnight in Manila", () => {
  it("reads the Manila date, not the UTC one", () => {
    const t = text(
      render(
        order({
          createdAt: new Date("2026-10-31T17:30:00Z"),
          expiresAt: new Date("2026-11-01T17:30:00Z"),
        })
      )
    )
    expect(t).toContain("Placed on Sun 1 Nov 2026")
    expect(t).toContain("Pay by Mon 2 Nov 2026, 1:30 AM")
  })
})

// docs/specs/031-pay-with-xendit: the payment area. NOW is 2026-10-31 08:00
// UTC; the order expires 2026-11-01 07:42 UTC.
// Pay now or Retry payment (Copy link is a button too)
const PAY_BUTTON = /<button[^>]*>(Pay now|Retry payment)<\/button>/

describe("the payment area (spec 031)", () => {
  const pending = order()
  const banner = "Test mode. This is a demo store"

  it("V1: shows the Test mode banner with the gateway's instructions", () => {
    const t = text(render(pending))
    expect(t).toContain(banner)
    expect(t).toContain("4000 0000 0000 1000")
    expect(text(render(pending, NOW, null, FAKE_INSTRUCTIONS))).toContain(
      "choose Pay or Cancel"
    )
  })

  it("V2: a return only confirms, with no button", () => {
    const html = render(pending, NOW, "return")
    expect(text(html)).toContain("Confirming your payment…")
    expect(html).not.toMatch(PAY_BUTTON)
    expect(html).toContain('aria-live="polite"')
  })

  it("V3: a cancel offers Retry payment", () => {
    const html = render(pending, NOW, "cancelled")
    expect(text(html)).toContain(
      "Payment not completed. You haven't been charged."
    )
    expect(html).toMatch(/<button[^>]*>Retry payment<\/button>/)
    expect(text(html)).toContain(banner)
  })

  it("V4: a failed open says so above Pay now", () => {
    const html = render(pending, NOW, "error")
    expect(text(html)).toContain(
      "We couldn't open the payment page. Try again."
    )
    expect(html).toMatch(/<button[^>]*>Pay now<\/button>/)
  })

  it("V5: under 10 minutes left, no button and the place-a-new-order text", () => {
    const html = render(pending, new Date("2026-11-01T07:32:01Z"))
    expect(text(html)).toContain(
      "This order expires in a few minutes and can't be paid. Place a new order."
    )
    expect(html).not.toMatch(PAY_BUTTON)
    expect(text(html)).toContain(banner)
  })

  it("V5a: exactly 10 minutes left is payable", () => {
    const html = render(pending, new Date("2026-11-01T07:32:00Z"))
    expect(html).toMatch(/<button[^>]*>Pay now<\/button>/)
  })

  it("V5b: the open error gives way to the too-late text", () => {
    const t = text(render(pending, new Date("2026-11-01T07:33:00Z"), "error"))
    expect(t).toContain("This order expires in a few minutes")
    expect(t).not.toContain("We couldn't open the payment page.")
  })

  it("V6: past the deadline, the past-due text and no button", () => {
    const html = render(pending, new Date("2026-11-01T07:42:00Z"), "cancelled")
    expect(text(html)).toContain("The time to pay has passed.")
    expect(html).not.toMatch(PAY_BUTTON)
  })

  it.each([
    ["PAID", "return"],
    ["CANCELLED", "cancelled"],
  ] as const)("V7, V8: a %s order shows no payment area", (status, param) => {
    const t = text(render(order({ status }), NOW, param))
    expect(t).not.toContain(banner)
    expect(t).not.toContain("Confirming your payment")
    expect(t).not.toContain("Payment not completed")
    expect(t).not.toContain("Pay now")
    expect(t).not.toContain("Retry payment")
  })
})

// docs/specs/032-payment-webhooks: V10–V16e as markup
describe("after the gateway answered", () => {
  const PAID_AT = new Date("2026-11-01T07:05:00Z")
  const paid = (over: Partial<OrderPageData> = {}) =>
    order({ status: "PAID", paidAt: PAID_AT, paymentMethod: "GCASH", ...over })

  it("V10: says when and how a paid order was paid, with no payment area", () => {
    const t = text(render(paid()))
    expect(t).toContain("Paid on Sun 1 Nov 2026, 3:05 PM with GCash.")
    expect(t).not.toContain("Test mode")
    expect(t).not.toContain("Pay now")
    expect(t).not.toContain("Pay by")
  })

  it("V11: leaves out a method it can't name", () => {
    expect(text(render(paid({ paymentMethod: "QRPH" })))).toContain(
      "Paid on Sun 1 Nov 2026, 3:05 PM."
    )
  })

  it("V12: promises a refund for a payment after cancellation", () => {
    const t = text(render(order({ status: "CANCELLED", refundRequired: true })))
    expect(t).toContain(
      "Payment received after this order was cancelled. We'll refund it."
    )
    expect(t).not.toContain("Paid on")
  })

  it("V13: promises a refund for a second payment", () => {
    const t = text(render(paid({ refundRequired: true })))
    expect(t).toContain(
      "We received a second payment for this order. We'll refund it."
    )
    expect(t).toContain("Paid on Sun 1 Nov 2026, 3:05 PM with GCash.")
  })

  it("V14: offers Retry after the last session expired", () => {
    const t = text(
      render(order({ payments: { latest: "expired", needsCheck: false } }))
    )
    expect(t).toContain("Payment not completed. You haven't been charged.")
    expect(t).toContain("Retry payment")
  })

  it("V15: offers Pay now while a session is open", () => {
    const t = text(
      render(order({ payments: { latest: "pending", needsCheck: false } }))
    )
    expect(t).toContain("Pay now")
    expect(t).not.toContain("Payment not completed")
  })

  const check = { latest: "paid", needsCheck: true } as const
  const NEEDS_CHECK =
    "We received a payment that needs checking. We'll contact you."

  it.each([null, "return", "cancelled", "error"] as const)(
    "V16, V16a: needs checking, with no way to pay (payment=%s)",
    (param) => {
      const t = text(render(order({ payments: check }), NOW, param))
      expect(t).toContain(NEEDS_CHECK)
      for (const gone of [
        "Pay now",
        "Retry payment",
        "Confirming your payment",
        "Test mode",
        "Pay by",
      ]) {
        expect(t).not.toContain(gone)
      }
    }
  )

  it("V16b: needs checking past the payment time too", () => {
    const t = text(
      render(order({ payments: check }), new Date("2026-11-01T08:00:00Z"))
    )
    expect(t).toContain(NEEDS_CHECK)
    expect(t).not.toContain("The time to pay has passed")
  })

  it("V16d: says it under a cancelled order", () => {
    const t = text(render(order({ status: "CANCELLED", payments: check })))
    expect(t).toContain(NEEDS_CHECK)
  })

  it("V16e: a paid order with a mismatched second payment shows the refund only", () => {
    const t = text(render(paid({ refundRequired: true, payments: check })))
    expect(t).not.toContain(NEEDS_CHECK)
    expect(t).toContain("We received a second payment")
  })
})
