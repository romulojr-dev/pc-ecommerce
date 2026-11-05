import { describe, expect, it } from "vitest"

import { f1, f2, f3, input, STORE, VIEW } from "@/test-support/email-orders"

import { EMAIL_COPY } from "../copy"
import { orderDelivered } from "./order-delivered"
import { orderShipped } from "./order-shipped"
import { readyForPickup } from "./ready-for-pickup"

// docs/specs/043-order-fulfillment-transitions: E27 on the rendered HTML and
// plain text. Content assertions for both; only plain text is snapshotted.

const TEST_NOTE =
  "This is a demo store in test mode. No real money was charged and nothing will ship."

function common(email: { subject: string; html: string; text: string }) {
  expect(email.subject).toMatch(/^\[Demo\] /)
  expect(email.html).toContain(TEST_NOTE)
  expect(email.text).toContain(TEST_NOTE)
  expect(email.text).toContain(EMAIL_COPY.footer)
  expect(email.html).not.toContain("<script")
}

describe("Order shipped", () => {
  it("names the courier and tracking number, and links to the order", async () => {
    const email = await orderShipped(input(f1()))
    common(email)
    for (const part of [email.html, email.text]) {
      expect(part).toContain("Your order PCS-7KQ2M9XD is on its way.")
      expect(part).toContain("Courier: LBC")
      expect(part).toContain("Tracking number: 123456784821")
      expect(part).toContain("12 Mabini St")
      expect(part).toContain("View your order")
    }
    expect(email.text).toContain(VIEW)
    expect(email.text).toMatchSnapshot()
  })

  it("a cash order says how much to have ready", async () => {
    const email = await orderShipped(
      input(f1({ paymentOption: "COD", paidAt: null }))
    )
    expect(email.text).toContain(
      "Please have ₱23,110.00 ready when it arrives."
    )
  })

  it("escapes a courier that looks like markup", async () => {
    const email = await orderShipped(input(f1({ courier: "A&B <i>" })))
    expect(email.html).not.toContain("<i>")
  })
})

describe("Ready for pickup", () => {
  it("shows the store's address and hours and the time it was ready", async () => {
    const email = await readyForPickup(input(f2(), { store: STORE }))
    common(email)
    for (const part of [email.html, email.text]) {
      expect(part).toContain("Your order PCS-4TN8V2HC is ready for pickup.")
      expect(part).toContain("Unit 4, 88 Sample St, Makati")
      expect(part).toContain("Mon-Sat 10:00 AM-7:00 PM")
      expect(part).toContain("Ready Mon 2 Nov 2026, 11:00 AM")
    }
    expect(email.text).toMatchSnapshot()
  })

  it("a cash order says how much to bring", async () => {
    const email = await readyForPickup(
      input(f2({ paymentOption: "COD", paidAt: null }), { store: STORE })
    )
    expect(email.text).toContain(
      "Please bring ₱44,485.00 to pay when you pick it up."
    )
  })
})

describe("Order delivered", () => {
  it("says when it was delivered, by whom, and has no address block", async () => {
    const email = await orderDelivered(input(f3()))
    common(email)
    for (const part of [email.html, email.text]) {
      expect(part).toContain("Your order PCS-7KQ2M9XD was delivered.")
      expect(part).toContain("Delivered Tue 3 Nov 2026, 2:15 PM")
      expect(part).toContain("Courier: LBC")
      expect(part).not.toContain("12 Mabini St")
    }
    expect(email.text).toMatchSnapshot()
  })
})
