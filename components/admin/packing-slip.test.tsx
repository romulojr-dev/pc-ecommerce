import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ORDER_STATUSES } from "@/lib/admin/orders-params"
import type { PackingSlip } from "@/lib/admin/queries/orders"
import { statusLabel } from "@/lib/orders/timeline"

import { PackingSlipView } from "./packing-slip"

// docs/specs/041-admin-orders-list-detail: B15–B20, E24–E27

const slip = (over: Partial<PackingSlip> = {}): PackingSlip => ({
  orderNumber: "PCS-7K3M9Q2X",
  createdAt: new Date("2026-11-02T06:00:00Z"),
  status: "PROCESSING",
  fulfillment: "DELIVERY",
  paymentOption: "ONLINE",
  paidAt: new Date("2026-11-02T06:10:00Z"),
  contact: { masked: false, name: "Ana Reyes", mobile: "+639171234567" },
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
  weightGrams: 900,
  items: [
    { name: "AMD Ryzen 5 7600X", quantity: 2, buildId: null, slot: null },
  ],
  ...over,
})

const html = (s: PackingSlip) =>
  renderToStaticMarkup(
    <PackingSlipView slip={s} backHref="/admin/orders/PCS-7K3M9Q2X" />
  )

describe("the packing slip", () => {
  it("E24: name, mobile, full address, checklist, weight and payment", () => {
    const markup = html(slip())
    expect(markup).toContain("Packing slip")
    expect(markup).toContain("PCS-7K3M9Q2X")
    expect(markup).toContain("Ana Reyes")
    expect(markup).toContain("+639171234567")
    expect(markup).toContain("12 Mabini St")
    expect(markup).toContain("Quezon City")
    expect(markup).toContain("1100")
    expect(markup).toContain("AMD Ryzen 5 7600X")
    expect(markup).toContain("× 2")
    expect(markup).toContain("Order weight 900 g")
    expect(markup).toContain("Paid online")
  })

  it("has no price, no total and no email anywhere", () => {
    const markup = html(
      slip({
        items: [
          {
            name: "AMD Ryzen 5 7600X",
            quantity: 1,
            buildId: "b1",
            slot: "cpu",
          },
          { name: "Kingston NV2", quantity: 1, buildId: null, slot: null },
        ],
      })
    )
    expect(markup).not.toContain("₱")
    expect(markup).not.toMatch(/subtotal|shipping|discount|voucher|total/i)
    expect(markup).not.toContain("@")
  })

  it("E25: a pickup order has the pickup text, name and mobile, and no address", () => {
    const markup = html(
      slip({ fulfillment: "PICKUP", address: { kind: "pickup" } })
    )
    expect(markup).toContain(
      "Store pickup. Customer shows the order number and a valid ID."
    )
    expect(markup).toContain("Ana Reyes")
    expect(markup).toContain("+639171234567")
    expect(markup).not.toContain("Ship to")
    expect(markup).not.toContain("Mabini")
  })

  it("E26: only Processing is ready to pack, every other status warns", () => {
    for (const status of ORDER_STATUSES) {
      const markup = html(slip({ status }))
      if (status === "PROCESSING") {
        expect(markup).not.toContain("Do not ship")
      } else {
        expect(markup, status).toContain(
          `Do not ship: this order is ${statusLabel(status)}.`
        )
      }
    }
  })

  it("the payment line never has an amount", () => {
    const base = { paidAt: null }
    expect(html(slip(base))).toContain("Not yet paid")
    expect(html(slip({ paymentOption: "COD", ...base }))).toContain(
      "Collect payment"
    )
    expect(
      html(
        slip({
          paymentOption: "COD",
          fulfillment: "PICKUP",
          address: { kind: "pickup" },
          ...base,
        })
      )
    ).toContain("Collect payment on pickup")
  })

  it("gathers a build's parts in a group, naming the slot", () => {
    const markup = html(
      slip({
        items: [
          {
            name: "AMD Ryzen 5 7600X",
            quantity: 1,
            buildId: "b1",
            slot: "cpu",
          },
          {
            name: "ASUS PRIME B650M",
            quantity: 1,
            buildId: "b1",
            slot: "motherboard",
          },
          { name: "Kingston NV2", quantity: 1, buildId: null, slot: null },
        ],
      })
    )
    expect(markup).toContain("Custom PC build")
    expect(markup).toContain("ASUS PRIME B650M")
    expect(markup).toContain("Kingston NV2")
  })

  it("hides the buttons and the link when printing, and offers Print", () => {
    const markup = html(slip())
    expect(markup).toContain("Print")
    expect(markup).toContain("Back to order")
    expect(markup).toContain("print:hidden")
  })

  it("E27: Demo's slip is masked and prints the region only", () => {
    const markup = html(
      slip({
        contact: {
          masked: true,
          name: "A••• R•••" as never,
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
    expect(markup).toContain("+63•••••••••")
    expect(markup).toContain("National Capital Region (NCR)")
    for (const raw of ["Ana", "Reyes", "9171234567", "Mabini", "Quezon"]) {
      expect(markup).not.toContain(raw)
    }
  })
})
