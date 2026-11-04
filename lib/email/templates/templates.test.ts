import { describe, expect, it } from "vitest"

import {
  cod1,
  cod2,
  input,
  p1,
  p2,
  SITE,
  STORE,
  VIEW,
} from "@/test-support/email-orders"

import { EMAIL_COPY } from "../copy"
import type { EmailContent } from "../templates"
import { codConfirm } from "./cod-confirm"
import { orderCancelled } from "./order-cancelled"
import { orderPlaced } from "./order-placed"
import { paymentReceived } from "./payment-received"

// docs/specs/036-order-emails: T1–T11 on the rendered HTML and plain text.
// The assertions read what a shopper reads (order number, items, totals,
// links, the test-mode sentence); only the plain-text versions are
// snapshotted (T10, D12).

const TEST_NOTE =
  "This is a demo store in test mode. No real money was charged and nothing will ship."

const paid = (overrides = {}) =>
  p1({
    status: "PAID",
    paidAt: new Date("2026-11-01T07:05:00Z"),
    paymentMethod: "GCASH",
    ...overrides,
  })
const cancelled = (overrides = {}) =>
  p1({ status: "CANCELLED", cancelReason: "EXPIRED", ...overrides })

// Every email, however its content differs
function expectCommon(email: EmailContent, orderNumber: string) {
  expect(email.subject).toMatch(/^\[Demo\] /)
  expect(email.subject).toContain(orderNumber)
  // T11: the test-mode sentence, in both versions
  expect(email.html).toContain(TEST_NOTE)
  expect(email.text).toContain(TEST_NOTE)
  expect(email.text).toContain(EMAIL_COPY.footer)
  // No remote images, scripts or tracking
  for (const part of [email.html, email.text]) {
    expect(part).not.toContain("<img")
    expect(part).not.toContain("<script")
    expect(part).not.toContain("background-image")
  }
  expect(email.html).toContain('lang="en"')
}

describe("Order placed", () => {
  it("T1: a delivery order, as HTML and plain text", async () => {
    const email = await orderPlaced(input(p1()))

    expectCommon(email, "PCS-7KQ2M9XD")
    expect(email.subject).toBe("[Demo] Order PCS-7KQ2M9XD placed")
    for (const part of [email.html, email.text]) {
      expect(part).toContain("Hi Ana Santos,")
      expect(part).toContain("We received your order PCS-7KQ2M9XD.")
      expect(part).toContain("AMD Ryzen 5 7600")
      expect(part).toContain("₱11,495.00 × 2")
      expect(part).toContain("₱22,990.00")
      expect(part).toContain("₱120.00")
      expect(part).toContain("₱23,110.00")
      expect(part).toContain("12 Mabini St")
      expect(part).toContain("Pay by Mon 2 Nov 2026, 3:00 PM")
      expect(part).toContain("Pay now")
      expect(part).toContain("View your order")
      expect(part).not.toContain("Discount")
    }
    // The signed link, whole, in both versions
    expect(email.html).toContain(`href="${VIEW}"`.replaceAll("&", "&amp;"))
    expect(email.text).toContain(VIEW)
  })

  it("T2: a pickup order shows the store and no address", async () => {
    const email = await orderPlaced(input(p2(), { store: STORE }))

    expectCommon(email, "PCS-4TN8V2HC")
    for (const part of [email.html, email.text]) {
      expect(part).toContain("Custom PC build")
      expect(part).toContain("ASUS ROG Strix B650-A Gaming WiFi")
      expect(part).toContain("₱44,485.00")
      expect(part).toContain(STORE.address)
      expect(part).toContain(STORE.hours)
      expect(part).toContain("Bring your order number and a valid ID")
      expect(part).not.toContain("Delivery address")
    }
  })

  it("T5: a late email has no Pay now and states the status", async () => {
    const email = await orderPlaced(input(p1({ status: "PAID" })))

    expectCommon(email, "PCS-7KQ2M9XD")
    for (const part of [email.html, email.text]) {
      expect(part).not.toContain("Pay now")
      expect(part).not.toContain("Pay by")
      expect(part).toContain("Status: Paid")
      expect(part).toContain("View your order")
    }
  })

  it("T6: hostile text is escaped in HTML and left as text in the plain version", async () => {
    const email = await orderPlaced(
      input(p1({ contactName: "<b>Ana</b> & Co", street: 'Unit "5" <script>' }))
    )

    expect(email.html).not.toContain("<b>Ana</b>")
    expect(email.html).not.toContain("<script>")
    expect(email.html).toContain("&lt;b&gt;Ana&lt;/b&gt; &amp; Co")
    expect(email.text).toContain("Hi <b>Ana</b> & Co,")
  })

  it("T10: the plain text, delivery", async () => {
    expect((await orderPlaced(input(p1()))).text).toMatchSnapshot()
  })

  it("T10: the plain text, pickup with a build", async () => {
    expect(
      (await orderPlaced(input(p2(), { store: STORE }))).text
    ).toMatchSnapshot()
  })
})

describe("Payment received", () => {
  it("T7: amount, when and how, and the order link", async () => {
    const email = await paymentReceived(input(paid()))

    expectCommon(email, "PCS-7KQ2M9XD")
    expect(email.subject).toBe("[Demo] Payment received for order PCS-7KQ2M9XD")
    for (const part of [email.html, email.text]) {
      expect(part).toContain("We received your payment for order PCS-7KQ2M9XD.")
      expect(part).toContain("Amount paid: ₱23,110.00")
      expect(part).toContain("Paid on Sun 1 Nov 2026, 3:05 PM with GCash.")
      expect(part).toContain("View your order")
    }
    expect(email.text).toContain(VIEW)
  })

  it("T10: the same text for a pickup order", async () => {
    const delivery = await paymentReceived(input(paid()))
    const pickup = await paymentReceived(
      input(paid({ fulfillment: "PICKUP" }), { store: STORE })
    )
    expect(pickup.text).toBe(delivery.text)
    expect(delivery.text).toMatchSnapshot()
  })

  it("T12: an order with no paidAt does not render", async () => {
    await expect(
      paymentReceived(input(paid({ paidAt: null })))
    ).rejects.toThrow()
  })
})

describe("Order cancelled", () => {
  it("T9: the reason, no charge, a link to the shop and none to the order", async () => {
    const email = await orderCancelled(input(cancelled()))

    expectCommon(email, "PCS-7KQ2M9XD")
    expect(email.subject).toBe("[Demo] Order PCS-7KQ2M9XD was cancelled")
    for (const part of [email.html, email.text]) {
      // The apostrophe is escaped in HTML
      expect(part).toMatch(
        /Your order PCS-7KQ2M9XD was cancelled because it wasn(&#x27;|')t paid in time\. You haven(&#x27;|')t been charged\./
      )
      expect(part).toContain("Still want these parts? Visit PC Silicon")
      expect(part).not.toContain("/orders/")
      expect(part).not.toContain("sig=")
    }
    expect(email.text).toContain(SITE)
  })

  it("T10: the same text for a pickup order", async () => {
    const delivery = await orderCancelled(input(cancelled()))
    const pickup = await orderCancelled(
      input(cancelled({ fulfillment: "PICKUP" }))
    )
    expect(pickup.text).toBe(delivery.text)
    expect(delivery.text).toMatchSnapshot()
  })
})

describe("links in the plain text", () => {
  it("T11: a real signed link is never broken across lines", async () => {
    // A signed link as the sender mints it: 43-character signature
    const long = `${SITE}/orders/PCS-7KQ2M9XD?sig=${"A".repeat(43)}&exp=1793000000&p=view`
    const email = await orderPlaced(input(p1(), { viewUrl: long }))
    expect(email.text).toContain(long)
  })
})

// docs/specs/038-cash-on-delivery: U17 on the rendered HTML and plain text
describe("Confirm your order (cash on delivery)", () => {
  const CONFIRM = `${SITE}/orders/PCS-7KQ2M9XD?sig=SIG&exp=1793000000&p=cod-confirm`

  it("U17: a delivery order, as HTML and plain text", async () => {
    const email = await codConfirm(input(cod1()))

    expectCommon(email, "PCS-7KQ2M9XD")
    expect(email.subject).toBe(
      "[Demo] Confirm your cash-on-delivery order PCS-7KQ2M9XD"
    )
    // The button's link: HTML escapes the ampersands, the plain text doesn't
    expect(email.text).toContain(CONFIRM)
    expect(email.html).toContain(`href="${CONFIRM.replaceAll("&", "&amp;")}"`)
    for (const part of [email.html, email.text]) {
      expect(part).toContain("Hi Ana Santos,")
      expect(part).toContain(
        "Please confirm your cash-on-delivery order PCS-7KQ2M9XD to keep your parts reserved."
      )
      expect(part).toContain("Confirm by Mon 2 Nov 2026, 3:00 PM")
      expect(part).toContain("in cash when your order arrives")
      expect(part).toContain("Confirm order")
      expect(part).toContain("View your order")
      expect(part).toContain("AMD Ryzen 5 7600")
      expect(part).toContain("₱23,110.00")
      expect(part).toContain("12 Mabini St")
      expect(part).not.toContain("Pay now")
    }
  })

  it("U17: a pickup order says pay-on-pickup and shows the store", async () => {
    const email = await codConfirm(input(cod2(), { store: STORE }))

    expectCommon(email, "PCS-4TN8V2HC")
    expect(email.subject).toContain("pay-on-pickup")
    for (const part of [email.html, email.text]) {
      expect(part).toContain(STORE.address)
      expect(part).toContain("at the store when you collect it")
    }
  })

  it("U17: an order that was confirmed has no button, only its status", async () => {
    const email = await codConfirm(input(cod1({ status: "COD_CONFIRMED" })))

    for (const part of [email.html, email.text]) {
      expect(part).not.toContain("Confirm order")
      expect(part).not.toContain(CONFIRM)
      expect(part).toContain("Status: COD confirmed")
      expect(part).toContain("View your order")
    }
  })

  it("U17: hostile text is escaped", async () => {
    const email = await codConfirm(
      input(cod1({ contactName: "<b>Ana</b> & Co" }))
    )

    expect(email.html).not.toContain("<b>Ana</b>")
    expect(email.html).toContain("&lt;b&gt;Ana&lt;/b&gt; &amp; Co")
  })

  it("T10: the plain text, delivery", async () => {
    expect((await codConfirm(input(cod1()))).text).toMatchSnapshot()
  })

  it("T10: the plain text, pickup with a build", async () => {
    expect(
      (await codConfirm(input(cod2(), { store: STORE }))).text
    ).toMatchSnapshot()
  })
})
