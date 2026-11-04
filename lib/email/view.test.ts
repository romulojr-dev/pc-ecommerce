import { describe, expect, it } from "vitest"

import {
  buildPart,
  input,
  p1,
  p2,
  SITE,
  STORE,
  VIEW,
  item,
} from "@/test-support/email-orders"
import { SLOT_COPY } from "@/lib/build-state/slots"

import { EMAIL_COPY } from "./copy"
import type { EmailOrder } from "./templates"
import { emailView } from "./view"

// docs/specs/036-order-emails: T1–T6, T8 and T12 on the data side. The
// markup and the plain text are drawn from this, so what an email says is
// settled here; the templates' own tests read the rendered output.

describe("emailView: ORDER_PLACED", () => {
  it("T1: says what was ordered, what it costs and when to pay", () => {
    const view = emailView("ORDER_PLACED", input(p1()))

    expect(view.subject).toBe("[Demo] Order PCS-7KQ2M9XD placed")
    expect(view.greeting).toBe("Hi Ana Santos,")
    expect(view.lead).toBe("We received your order PCS-7KQ2M9XD.")
    expect(view.entries).toEqual([
      {
        kind: "single",
        line: {
          name: "AMD Ryzen 5 7600",
          slot: null,
          unit: "₱11,495.00 × 2",
          total: "₱22,990.00",
        },
      },
    ])
    expect(view.totals).toEqual([
      { label: "Subtotal", value: "₱22,990.00", strong: false },
      { label: "Shipping", value: "₱120.00", strong: false },
      { label: "Total", value: "₱23,110.00", strong: true },
    ])
    expect(view.where).toEqual({
      kind: "delivery",
      heading: "Delivery address",
      lines: [
        "12 Mabini St",
        "Alicia, Quezon City, Metro Manila, National Capital Region (NCR) 1100",
      ],
    })
    expect(view.details).toEqual([
      "Pay by Mon 2 Nov 2026, 3:00 PM. Unpaid orders are cancelled at that time.",
    ])
    expect(view.statusLine).toBeNull()
    // Pay now and the order link are the one signed link (D1)
    expect(view.action).toEqual({ label: "Pay now", href: VIEW })
    expect(view.links).toEqual([{ label: "View your order", href: VIEW }])
    expect(view.testNote).toBe(
      "This is a demo store in test mode. No real money was charged and nothing will ship."
    )
    expect(view.linkNote).toBe(EMAIL_COPY.linkNote)
  })

  it("T2: a pickup order shows the store's address and hours, one build group", () => {
    const view = emailView("ORDER_PLACED", input(p2(), { store: STORE }))

    expect(view.where).toEqual({
      kind: "pickup",
      heading: "Pick up at",
      address: STORE.address,
      hours: STORE.hours,
      note: "Bring your order number and a valid ID when you collect your order.",
    })
    expect(view.entries).toEqual([
      {
        kind: "build",
        name: "Custom PC build",
        total: "₱44,485.00",
        parts: [
          {
            name: "AMD Ryzen 5 7600",
            slot: SLOT_COPY.cpu.name,
            unit: "₱11,495.00 × 1",
            total: "₱11,495.00",
          },
          {
            name: "ASUS ROG Strix B650-A Gaming WiFi",
            slot: SLOT_COPY.motherboard.name,
            unit: "₱14,995.00 × 1",
            total: "₱14,995.00",
          },
          {
            name: "ASUS Dual GeForce RTX 4060 OC Edition 8GB",
            slot: SLOT_COPY.gpu.name,
            unit: "₱17,995.00 × 1",
            total: "₱17,995.00",
          },
        ],
      },
    ])
    expect(view.totals?.at(-1)).toEqual({
      label: "Total",
      value: "₱44,485.00",
      strong: true,
    })
    expect(view.totals?.[1].value).toBe("Free (pickup)")
  })

  it("T2: a pickup order with no store settings is a bug, not a blank address", () => {
    expect(() => emailView("ORDER_PLACED", input(p2()))).toThrow()
  })

  it("T3: two builds are numbered and a single line keeps its place", () => {
    const order = p1({
      items: [
        buildPart("cpu", "AMD Ryzen 5 7600", 1_149_500, "b1"),
        item({ nameSnapshot: "Thermal paste", priceSnapshot: 25_000 }),
        buildPart("cpu", "AMD Ryzen 5 7600", 1_149_500, "b2"),
      ],
    })
    const entries = emailView("ORDER_PLACED", input(order)).entries!

    expect(
      entries.map((e) => (e.kind === "build" ? e.name : e.line.name))
    ).toEqual(["Custom PC build 1", "Thermal paste", "Custom PC build 2"])
  })

  it("T4/O2: a discount shows as its own row, named for its voucher", () => {
    const order = p1({
      discount: 50_000,
      total: 2_261_000,
      voucherCode: "SAVE500",
    })
    const labels = emailView("ORDER_PLACED", input(order)).totals!

    expect(labels.map((row) => [row.label, row.value])).toEqual([
      ["Subtotal", "₱22,990.00"],
      ["Shipping", "₱120.00"],
      ["Discount (SAVE500)", "−₱500.00"],
      ["Total", "₱22,610.00"],
    ])
  })

  it("O2/O3: no Discount row without a discount, even with a voucher", () => {
    for (const order of [p1(), p1({ voucherCode: "SAVE500" })]) {
      const rows = emailView("ORDER_PLACED", input(order)).totals!
      expect(rows.map((row) => row.label)).toEqual([
        "Subtotal",
        "Shipping",
        "Total",
      ])
    }
  })

  it("T5: an email built after the deadline has no pay block", () => {
    const at = new Date("2026-11-02T07:00:00Z")
    const view = emailView("ORDER_PLACED", input(p1(), { now: at }))

    expect(view.action).toBeNull()
    expect(view.details).toEqual([])
    expect(view.statusLine).toBe("Status: Pending payment")
    expect(view.links).toEqual([{ label: "View your order", href: VIEW }])
  })

  it("T5: one second before the deadline it still has one", () => {
    const at = new Date("2026-11-02T06:59:59Z")
    expect(
      emailView("ORDER_PLACED", input(p1(), { now: at })).action
    ).not.toBeNull()
  })

  it.each([
    ["PAID", "Status: Paid"],
    ["CANCELLED", "Status: Cancelled"],
  ] as const)("T5: a %s order shows %s and no Pay now", (status, line) => {
    const view = emailView("ORDER_PLACED", input(p1({ status })))

    expect(view.action).toBeNull()
    expect(view.details).toEqual([])
    expect(view.statusLine).toBe(line)
  })

  it("T6: names are carried as they are; escaping is the renderer's", () => {
    const order = p1({
      contactName: "<b>Ana</b> & Co",
      street: 'Unit "5" & 6',
    })
    const view = emailView("ORDER_PLACED", input(order))

    expect(view.greeting).toBe("Hi <b>Ana</b> & Co,")
    expect(view.where).toMatchObject({
      lines: ['Unit "5" & 6', expect.any(String)],
    })
  })
})

describe("emailView: PAYMENT_RECEIVED", () => {
  const paid = (overrides: Partial<EmailOrder> = {}) =>
    p1({
      status: "PAID",
      paidAt: new Date("2026-11-01T07:05:00Z"),
      paymentMethod: "GCASH",
      ...overrides,
    })

  it("T7: the order's total, when and how it was paid, and the order link", () => {
    const view = emailView("PAYMENT_RECEIVED", input(paid()))

    expect(view.subject).toBe("[Demo] Payment received for order PCS-7KQ2M9XD")
    expect(view.lead).toBe("We received your payment for order PCS-7KQ2M9XD.")
    expect(view.details).toEqual([
      "Amount paid: ₱23,110.00",
      "Paid on Sun 1 Nov 2026, 3:05 PM with GCash.",
    ])
    expect(view.action).toEqual({ label: "View your order", href: VIEW })
    expect(view.entries).toBeNull()
    expect(view.where).toBeNull()
  })

  it.each([
    ["FAKE", "Paid on Sun 1 Nov 2026, 3:05 PM with the test payment page."],
    [null, "Paid on Sun 1 Nov 2026, 3:05 PM."],
    ["WIRE", "Paid on Sun 1 Nov 2026, 3:05 PM."],
  ])("T8: method %s", (paymentMethod, line) => {
    const view = emailView("PAYMENT_RECEIVED", input(paid({ paymentMethod })))
    expect(view.details[1]).toBe(line)
  })

  it("T10: it reads the same for a pickup order", () => {
    const delivery = emailView("PAYMENT_RECEIVED", input(paid()))
    const pickup = emailView(
      "PAYMENT_RECEIVED",
      input(paid({ fulfillment: "PICKUP", orderNumber: "PCS-7KQ2M9XD" }), {
        store: STORE,
      })
    )
    expect(pickup).toEqual(delivery)
  })

  it("T12: an order with no paidAt is a bug, not a state", () => {
    expect(() =>
      emailView("PAYMENT_RECEIVED", input(paid({ paidAt: null })))
    ).toThrow()
  })
})

describe("emailView: ORDER_CANCELLED", () => {
  const cancelled = (overrides: Partial<EmailOrder> = {}) =>
    p1({ status: "CANCELLED", cancelReason: "EXPIRED", ...overrides })

  it("T9: the reason, no charge, and a link to the shop only", () => {
    const view = emailView("ORDER_CANCELLED", input(cancelled()))

    expect(view.subject).toBe("[Demo] Order PCS-7KQ2M9XD was cancelled")
    expect(view.lead).toBe(
      "Your order PCS-7KQ2M9XD was cancelled because it wasn't paid in time. You haven't been charged."
    )
    expect(view.action).toBeNull()
    expect(view.links).toEqual([
      { label: "Still want these parts? Visit PC Silicon", href: SITE },
    ])
    expect(JSON.stringify(view)).not.toContain("/orders/")
    expect(view.linkNote).toBeNull()
  })

  it("T9: a site URL with a trailing slash still gives the bare root", () => {
    const view = emailView(
      "ORDER_CANCELLED",
      input(cancelled(), { siteUrl: `${SITE}/` })
    )
    expect(view.links[0].href).toBe(SITE)
  })

  it("T10: it reads the same for a pickup order", () => {
    const delivery = emailView("ORDER_CANCELLED", input(cancelled()))
    const pickup = emailView(
      "ORDER_CANCELLED",
      input(cancelled({ fulfillment: "PICKUP" }))
    )
    expect(pickup).toEqual(delivery)
  })

  it("has no reason line when the order has none", () => {
    const view = emailView(
      "ORDER_CANCELLED",
      input(cancelled({ cancelReason: null }))
    )
    expect(view.lead).toBe("Your order PCS-7KQ2M9XD was cancelled.")
  })
})

describe("emailView: types with no view", () => {
  it("COD_CONFIRM is #95's", () => {
    expect(() => emailView("COD_CONFIRM", input(p1()))).toThrow()
  })
})
