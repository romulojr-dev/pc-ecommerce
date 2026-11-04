import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { CodConfirmPageData } from "@/lib/orders/get-cod-confirm"

import { CodConfirmView } from "./cod-confirm-view"

// docs/specs/038-cash-on-delivery: O8, the confirmation page as markup. The
// access rules and the write are lib/orders/confirm-cod.db.test.ts's.

// The button is a client component that calls a server action
vi.mock("@/app/(store)/orders/[number]/actions", () => ({
  confirmCodOrderAction: async () => ({ ok: false, reason: "error" }),
}))

const link = { sig: "S".repeat(43), exp: "1793000000", p: "cod-confirm" }
// 2026-11-05 10:00 in Manila
const DEADLINE = new Date("2026-11-05T02:00:00Z")

const confirm = (
  over: Partial<Extract<CodConfirmPageData, { view: "confirm" }>> = {}
): CodConfirmPageData => ({
  view: "confirm",
  orderNumber: "PCS-7KQ2M9XD",
  fulfillment: "DELIVERY",
  expiresAt: DEADLINE,
  items: [
    {
      name: "AMD Ryzen 5 7600",
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
  address: {
    street: "12 Mabini St",
    barangay: "Alicia",
    city: "Quezon City",
    province: "Metro Manila",
    region: "National Capital Region (NCR)",
    zip: "1100",
  },
  store: null,
  ...over,
})

const render = (data: CodConfirmPageData) =>
  renderToStaticMarkup(<CodConfirmView data={data} link={link} />)

describe("the confirm view", () => {
  it("O8: has the button, the lead, what will be paid, the items and the totals", () => {
    const html = render(confirm())

    expect(html).toContain("Confirm your order")
    expect(html).toContain(
      "Order PCS-7KQ2M9XD. Confirm it to keep your parts reserved until Thu 5 Nov 2026, 10:00 AM."
    )
    expect(html).toContain(
      "You&#x27;ll pay ₱23,110.00 in cash when your order arrives."
    )
    expect(html).toContain(">Confirm order</button>")
    expect(html).toContain("AMD Ryzen 5 7600")
    expect(html).toContain("₱11,495.00 × 2")
    expect(html).toContain("₱22,990.00")
    expect(html).toContain("₱120.00")
    expect(html).toContain("12 Mabini St")
  })

  it("O8: shows no contact details", () => {
    const html = render(confirm())

    for (const personal of ["ana@example.com", "Ana Santos", "+639171234567"]) {
      expect(html).not.toContain(personal)
    }
    // and no link or secret
    expect(html).not.toContain(link.sig)
  })

  it("O8: a pickup order pays at the store and shows it", () => {
    const html = render(
      confirm({
        fulfillment: "PICKUP",
        address: null,
        store: { address: "Unit 4, 88 Sample St, Makati", hours: "Mon-Sat" },
        shippingFee: 0,
        total: 2_299_000,
      })
    )

    expect(html).toContain("in cash at the store when you collect it.")
    expect(html).toContain("Unit 4, 88 Sample St, Makati")
    expect(html).toContain("Free (pickup)")
  })

  it("O8: a discount row carries its code", () => {
    const html = render(
      confirm({ discount: 229_900, voucherCode: "WELCOME10", total: 2_081_100 })
    )

    expect(html).toContain("Discount (WELCOME10)")
    expect(html).toContain("−₱2,299.00")
  })

  it("O8: hostile item names are escaped", () => {
    const html = render(
      confirm({
        items: [
          {
            name: "<script>alert(1)</script>",
            unitPrice: 100,
            quantity: 1,
            buildId: null,
            slot: null,
          },
        ],
      })
    )

    expect(html).not.toContain("<script>alert(1)")
    expect(html).toContain("&lt;script&gt;")
  })
})

describe("the confirmed and cancelled views", () => {
  const base = {
    orderNumber: "PCS-7KQ2M9XD",
    fulfillment: "DELIVERY" as const,
    expiresAt: DEADLINE,
    total: 2_311_000,
  }

  it("O8: already confirmed says so, with what to pay, and has no button", () => {
    const html = render({ view: "confirmed", ...base })

    expect(html).toContain("This order is already confirmed.")
    expect(html).toContain("Pay ₱23,110.00 in cash when it arrives.")
    expect(html).not.toContain("<button")
    expect(html).not.toContain("Items")
  })

  it("O8: cancelled says it wasn't confirmed in time, links to the shop and has no button", () => {
    const html = render({ view: "cancelled", ...base })

    expect(html).toContain(
      "This order was cancelled because it wasn&#x27;t confirmed in time. Place a new order if you still want these parts."
    )
    expect(html).toContain("Visit PC Silicon")
    expect(html).toContain('href="/"')
    expect(html).not.toContain("<button")
    expect(html).not.toContain("Items")
  })
})
