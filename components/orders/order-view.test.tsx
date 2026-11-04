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
    viaLink: false,
    status: "PENDING_PAYMENT",
    fulfillment: "DELIVERY",
    paymentOption: "ONLINE",
    confirmedAt: null,
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
    voucherCode: null,
    total: 2_311_000,
    paidAt: null,
    paymentMethod: null,
    refundRequired: false,
    cancelReason: null,
    payments: { latest: null, needsCheck: false },
    ...over,
  }
}

const render = (
  o: OrderPageData,
  now = NOW,
  param: PaymentParam | null = null,
  instructions = XENDIT_INSTRUCTIONS,
  confirmSender = "orders@mail.pcsilicon.tech"
) =>
  renderToStaticMarkup(
    <OrderView
      order={o}
      payment={{
        view: paymentView(o.status, o.expiresAt, param, now, o.payments),
        instructions,
        gatewayName: "Xendit",
        confirmSender,
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
      "Save this link to see your order. We're also emailing you a link to it; if it doesn't arrive, this one still works."
    )
    expect(html).toContain("Copy link")
    expect(html).toContain("Your order link")
  })

  // docs/specs/035-email-foundation-signed-links, D8
  it("doesn't offer to save the link when opened by a signed link", () => {
    const viaLink = render(order({ viaLink: true }))
    expect(text(viaLink)).not.toContain("Save this link")
    expect(viaLink).not.toContain("Copy link")
    expect(text(viaLink)).toContain("Pay now")
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

  it("shows a Discount line only above zero, named for its voucher (O1)", () => {
    const t = text(
      render(
        order({
          discount: 100_000,
          total: 2_211_000,
          voucherCode: "WELCOME10",
        })
      )
    )
    expect(t).toContain("Discount (WELCOME10) −₱1,000.00")
  })

  it("O1: lists Subtotal, Shipping, Discount (CODE), Total in that order", () => {
    const t = text(
      render(
        order({
          subtotal: 2_299_000,
          discount: 229_900,
          total: 2_081_100,
          voucherCode: "WELCOME10",
        })
      )
    )
    expect(t).toContain(
      "Subtotal ₱22,990.00 Shipping ₱120.00 Discount (WELCOME10) −₱2,299.00 Total ₱20,811.00"
    )
  })

  it("O3: shows no Discount line for a voucher worth nothing", () => {
    const t = text(render(order({ discount: 0, voucherCode: "WELCOME10" })))
    expect(t).not.toContain("Discount")
  })
})

// Changed by docs/specs/033-release-unpaid-orders: past the payment time the
// order reads as cancelled (V2 there)
describe("V11: past the payment time", () => {
  it("shows it cancelled and drops the pay-by line", () => {
    const t = text(render(order(), new Date("2026-11-01T07:42:00Z")))
    expect(t).toContain(
      "This order was cancelled because it wasn't paid in time."
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

  it("V6: past the deadline, cancelled and no button (spec 033)", () => {
    const html = render(pending, new Date("2026-11-01T07:42:00Z"), "cancelled")
    expect(text(html)).toContain("wasn't paid in time")
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
    expect(t).not.toContain("wasn't paid in time")
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

// docs/specs/033-release-unpaid-orders: V1–V6 as markup
describe("an order that wasn't paid in time", () => {
  const EXPIRED =
    "This order was cancelled because it wasn't paid in time. Place a new order if you still want these parts."
  const DEADLINE = new Date("2026-11-01T07:42:00Z")
  const gone = [
    "Pay now",
    "Retry payment",
    "Confirming your payment",
    "Test mode",
    "Pay by",
    "The time to pay has passed",
  ]
  const currentItems = (html: string) =>
    [...html.matchAll(/aria-current="step"[^>]*>([\s\S]*?)</g)].map(
      ([, label]) => label.trim()
    )

  it("V1: released, it reads as cancelled with the line", () => {
    const html = render(
      order({ status: "CANCELLED", cancelReason: "EXPIRED" }),
      DEADLINE
    )
    const t = text(html)
    expect(t).toContain(EXPIRED)
    expect(t).toContain("· Cancelled")
    for (const missing of gone) expect(t).not.toContain(missing)
  })

  it.each([null, "return", "cancelled", "error"] as const)(
    "V2, V2a: pending past the deadline reads the same (payment=%s)",
    (param) => {
      const pending = text(render(order(), DEADLINE, param))
      const released = text(
        render(
          order({ status: "CANCELLED", cancelReason: "EXPIRED" }),
          DEADLINE
        )
      )
      expect(pending).toBe(released)
    }
  )

  it("V2: the timeline shows Cancelled, not Pending payment, as current", () => {
    const html = render(order(), DEADLINE)
    expect(currentItems(html)).not.toContain("Pending payment")
    expect(text(html)).toContain("Cancelled")
  })

  it("V2b: a second before the deadline is still the too-late view", () => {
    const t = text(render(order(), new Date("2026-11-01T07:41:59Z")))
    expect(t).not.toContain(EXPIRED)
    expect(t).toContain("Pay by")
    expect(t).toContain("This order expires in a few minutes")
  })

  it("V2c: no Retry after an expired session either", () => {
    const t = text(
      render(
        order({ payments: { latest: "expired", needsCheck: false } }),
        DEADLINE
      )
    )
    expect(t).toContain(EXPIRED)
    expect(t).not.toContain("Retry payment")
  })

  it("V3: a late payment adds the refund line under it", () => {
    const t = text(
      render(
        order({
          status: "CANCELLED",
          cancelReason: "EXPIRED",
          refundRequired: true,
        }),
        DEADLINE
      )
    )
    expect(t).toContain(
      `${EXPIRED} Payment received after this order was cancelled. We'll refund it.`
    )
  })

  it("V4: a cancel with no reason has no expiry line", () => {
    expect(text(render(order({ status: "CANCELLED" })))).not.toContain(EXPIRED)
  })

  it("V5: a payment that needs checking keeps its own view", () => {
    const t = text(
      render(
        order({ payments: { latest: "paid", needsCheck: true } }),
        DEADLINE
      )
    )
    expect(t).toContain("We received a payment that needs checking.")
    expect(t).not.toContain(EXPIRED)
  })

  it("V6: a paid order is never shown as expired", () => {
    const t = text(
      render(
        order({ status: "PAID", paidAt: new Date("2026-11-01T07:00:00Z") }),
        new Date("2026-11-02T00:00:00Z")
      )
    )
    expect(t).not.toContain(EXPIRED)
    expect(t).toContain("Paid on")
  })
})

// docs/specs/038-cash-on-delivery: O1–O4
describe("a cash order", () => {
  // placed 2026-11-04 10:00 Manila, to be confirmed by 2026-11-05 10:00 Manila
  const PLACED = new Date("2026-11-04T02:00:00Z")
  const DEADLINE = new Date("2026-11-05T02:00:00Z")
  const BEFORE = new Date("2026-11-04T05:00:00Z")
  const cash = (over: Partial<OrderPageData> = {}) =>
    order({
      paymentOption: "COD",
      status: "PENDING_CONFIRMATION",
      createdAt: PLACED,
      expiresAt: DEADLINE,
      ...over,
    })

  it("O1: pending, shows the timeline, the check-your-email text and no way to pay", () => {
    const html = render(cash(), BEFORE)
    const plain = text(html)

    expect(plain).toContain("Pending confirmation")
    expect(plain).toContain("COD confirmed")
    expect(plain).not.toContain("Pending payment")
    expect(html).toContain('aria-current="step"')
    // the one current step is Pending confirmation
    expect(html.match(/aria-current="step"/g)).toHaveLength(1)
    expect(plain).toContain(
      "Check your email (from orders@mail.pcsilicon.tech) to confirm this order. If it doesn't arrive, the order cancels itself at Thu 5 Nov 2026, 10:00 AM and you can place a new one."
    )
    // no Pay now, no payment panel, no test-mode banner, no confirm button
    expect(plain).not.toContain("Pay now")
    expect(plain).not.toContain("Test mode")
    expect(plain).not.toContain("Confirm order")
    expect(plain).not.toContain("Retry payment")
    // the save-the-link prompt as for any order opened with its key
    expect(html).toContain("Your order link")
    // the Payment row
    expect(plain).toContain("Payment Cash on delivery")
  })

  it("O1a/O1b: names whatever sender the store sends from", () => {
    const html = render(
      cash(),
      BEFORE,
      null,
      XENDIT_INSTRUCTIONS,
      "shop@example.com"
    )
    expect(text(html)).toContain("(from shop@example.com)")
  })

  it("O1c: the same when opened by a signed link, without the save-the-link prompt", () => {
    const html = render(cash({ viaLink: true }), BEFORE)

    expect(text(html)).toContain(
      "Check your email (from orders@mail.pcsilicon.tech)"
    )
    expect(html).not.toContain("Your order link")
  })

  it("O2: confirmed, shows when, and what to pay", () => {
    const confirmedAt = new Date("2026-11-04T04:30:00Z")
    const html = render(cash({ status: "COD_CONFIRMED", confirmedAt }), BEFORE)
    const plain = text(html)

    expect(plain).toContain("Confirmed Wed 4 Nov 2026, 12:30 PM")
    expect(plain).toContain(
      "You confirmed this order. Pay ₱23,110.00 in cash when it arrives."
    )
    expect(plain).not.toContain("Check your email")
    expect(html.match(/aria-current="step"/g)).toHaveLength(1)
  })

  it("O3: a pickup order reads Pay on pickup and when to collect", () => {
    const html = render(
      cash({
        fulfillment: "PICKUP",
        address: null,
        store: { address: "Unit 4, Makati", hours: "Mon-Sat" },
        shippingFee: 0,
        total: 2_299_000,
        status: "COD_CONFIRMED",
        confirmedAt: new Date("2026-11-04T04:30:00Z"),
      }),
      BEFORE
    )
    const plain = text(html)

    expect(plain).toContain("Payment Pay on pickup")
    expect(plain).toContain("Pay ₱22,990.00 in cash when you collect it.")
    expect(plain).toContain("Ready for pickup")
    expect(plain).toContain("Unit 4, Makati")
  })

  it("O4: pending past its deadline reads cancelled, with the not-confirmed text", () => {
    const html = render(cash(), DEADLINE)
    const plain = text(html)

    expect(plain).toContain("Cancelled")
    expect(plain).toContain(
      "This order was cancelled because it wasn't confirmed in time. Place a new order if you still want these parts."
    )
    expect(plain).not.toContain("Check your email")
    expect(plain).not.toContain("wasn't paid in time")
  })

  it("O4: a released order says the same, whatever the clock", () => {
    const html = render(
      cash({ status: "CANCELLED", cancelReason: "EXPIRED" }),
      BEFORE
    )

    expect(text(html)).toContain("wasn't confirmed in time")
  })

  it("O4: a confirmed order past its deadline stays confirmed", () => {
    const html = render(
      cash({
        status: "COD_CONFIRMED",
        confirmedAt: new Date("2026-11-04T04:30:00Z"),
      }),
      new Date("2027-01-01T00:00:00Z")
    )
    const plain = text(html)

    expect(plain).not.toContain("Cancelled")
    expect(plain).toContain("You confirmed this order")
  })

  it("an online order shows no Payment row and none of the cash text", () => {
    const plain = text(render(order()))

    expect(plain).not.toContain("Cash on delivery")
    expect(plain).not.toContain("Check your email")
    expect(plain).not.toContain("Confirmed ")
  })
})
