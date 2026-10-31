import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { OrderStatusName } from "@/lib/orders/timeline"
import type { OrderPageData, OrderPageItem } from "@/lib/orders/view"

import { OrderView } from "./order-view"

// docs/specs/030-place-an-order: V1, V7–V11, V16 as markup (the access rules
// are in lib/orders/get-order.db.test.ts)

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
    ...over,
  }
}

const render = (o: OrderPageData, now = NOW) =>
  renderToStaticMarkup(<OrderView order={o} now={now} />)

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

  it("shows the pay-by time and the coming-soon line", () => {
    expect(text(html)).toContain("Pay by Sun 1 Nov 2026, 3:42 PM")
    expect(text(html)).toContain("Paying online is coming soon.")
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
