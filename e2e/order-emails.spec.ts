import type { Page } from "@playwright/test"

import { fakeEmailsFor, orderLinkPath, setExpiresAt } from "./orders"
import { readStock, setStock } from "./stock"
import { expect, test } from "./test"

// The three order emails reach the fake outbox and their links open the order
// (docs/specs/036-order-emails, X1–X4, V7). Needs a seeded database,
// ORDERS_ENABLED=true, PAYMENT_GATEWAY=fake, EMAIL_TRANSPORT=fake and
// ORDER_LINK_SECRET for the app server. Like the other order specs it takes
// real stock and leaves its orders behind (#74), so it uses one part no other
// spec uses, sets a known stock first and restores the seed's after. Every
// order has its own address: the sender caps a recipient at five emails a day
// (spec 035), and a run places several.

const PART = "NZXT H5 Flow (2024) Black"
const PART_PAGE = "/case/nzxt-h5-flow-2024-black"
// What `pnpm db:seed` gives it (prisma/seed/data/cases.ts)
const SEED_STOCK = 8
const STOCK = 12

const ORDER_URL =
  /\/orders\/(PCS-[0-9A-HJKMNP-TV-Z]{8})\?key=[A-Za-z0-9_-]{43}$/
const FAKE_PAY_URL = /\/test-payment\/ps-[0-9a-f]{24}\?/

// Each test places an order and waits for emails, which is slower than the
// default limit allows on a busy server
test.describe.configure({ mode: "serial", timeout: 90_000 })

test.beforeAll(async () => {
  await setStock(PART, STOCK)
})
test.afterAll(async () => {
  await setStock(PART, SEED_STOCK)
})

// A recipient no other test uses
const addressFor = (label: string) =>
  `e2e-${label}-${Date.now().toString(36)}@example.com`

// Places one part, by delivery to Quezon City or by pickup, for `email`, and
// returns the order's number: the browser ends on the order page opened with
// its key
async function placeOrder(
  page: Page,
  email: string,
  fulfillment: "delivery" | "pickup"
): Promise<string> {
  const counted = page.waitForResponse((r) =>
    r.url().endsWith("/api/cart/count")
  )
  await page.goto(PART_PAGE)
  await counted
  await page.getByRole("button", { name: "Add to cart" }).click()
  await expect(page.getByText(/Added (\d+ )?to your cart\./)).toBeVisible()

  await page.goto("/cart")
  await page.getByRole("link", { name: "Checkout" }).click()
  await expect(page.getByLabel("Email")).toBeEnabled()
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Full name").fill("Ana Santos")
  await page.getByLabel("Mobile number").fill("0917 123 4567")
  if (fulfillment === "pickup") {
    await page.getByLabel("Store pickup").check()
  } else {
    await page
      .getByLabel("Region", { exact: true })
      .selectOption({ label: "National Capital Region (NCR)" })
    await expect(page.getByLabel("Province", { exact: true })).toHaveValue(
      "1300000000"
    )
    await page
      .getByLabel("City / municipality")
      .selectOption({ label: "Quezon City" })
    await page.getByLabel("Barangay").selectOption({ label: "Alicia" })
    await page.getByLabel("Street address").fill("12 Mabini St")
    await page.getByLabel("ZIP code").fill("1100")
  }
  await page.getByRole("button", { name: "Continue to review" }).click()
  await page.getByRole("button", { name: "Place order" }).click()

  // Place order goes straight to the payment page; Back lands on the order
  await expect(page).toHaveURL(FAKE_PAY_URL)
  await page.goBack()
  await expect(page).toHaveURL(ORDER_URL)
  return ORDER_URL.exec(page.url())![1]
}

// Waits until `address` has `count` emails. The send runs after the response;
// a page load also sweeps the outbox, so each try loads one.
async function emailsArrive(page: Page, address: string, count: number) {
  await expect(async () => {
    await page.goto("/cart")
    expect((await fakeEmailsFor(address)).length).toBe(count)
  }).toPass({ timeout: 30_000 })
  return fakeEmailsFor(address)
}

const step = (page: Page) =>
  page
    .getByRole("navigation", { name: "Order status" })
    .locator('[aria-current="step"]')

const emailA = addressFor("paid")
const emailB = addressFor("cancelled")
let numberA = ""
let numberB = ""

test("Order placed arrives and its Pay now link opens the order (X1)", async ({
  page,
}) => {
  numberA = await placeOrder(page, emailA, "delivery")

  const [placed] = await emailsArrive(page, emailA, 1)

  expect(placed.subject).toBe(`[Demo] Order ${numberA} placed`)
  expect(placed.text).toContain("Hi Ana Santos,")
  expect(placed.text).toContain("12 Mabini St")
  expect(placed.text).toContain("Pay by ")
  expect(placed.text).toContain(
    "This is a demo store in test mode. No real money was charged and nothing will ship."
  )
  expect(placed.html).toContain("Pay now")

  const response = await page.goto(orderLinkPath(placed.text))

  expect(response?.status()).toBe(200)
  await expect(
    page.getByRole("heading", { name: `Order ${numberA}`, level: 1 })
  ).toBeVisible()
  await expect(page.getByText(PART)).toBeVisible()
  await expect(step(page)).toHaveText("Pending payment")
  // Opened by a signed link: no save-the-link prompt, and Pay now is there
  await expect(page.getByText(/^Save this link/)).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Pay now" })).toBeVisible()
})

test("Payment received arrives after paying, and its link shows Paid (X2)", async ({
  page,
}) => {
  await page.goto(orderLinkPath((await fakeEmailsFor(emailA))[0].text))
  await page.getByRole("button", { name: "Pay now" }).click()
  await expect(page).toHaveURL(FAKE_PAY_URL)
  await page.getByRole("button", { name: "Pay", exact: true }).click()
  await expect(step(page)).toHaveText("Paid")

  const [, received] = await emailsArrive(page, emailA, 2)

  expect(received.subject).toBe(`[Demo] Payment received for order ${numberA}`)
  expect(received.text).toContain("Amount paid: ₱")
  expect(received.text).toContain("with the test payment page.")
  await page.goto(orderLinkPath(received.text))
  await expect(step(page)).toHaveText("Paid")
})

test("Order cancelled arrives when an unpaid order expires (X3)", async ({
  page,
}) => {
  numberB = await placeOrder(page, emailB, "pickup")
  const orderUrl = page.url()
  expect(await readStock(PART)).toBeLessThan(STOCK)
  await emailsArrive(page, emailB, 1)

  await setExpiresAt(numberB, new Date(Date.now() - 60_000))

  // A page load sweeps expired orders after its response, then sends
  const [, cancelled] = await emailsArrive(page, emailB, 2)

  expect(cancelled.subject).toBe(`[Demo] Order ${numberB} was cancelled`)
  expect(cancelled.text).toContain(
    "because it wasn't paid in time. You haven't been charged."
  )
  expect(cancelled.text).not.toContain("/orders/")
  await page.goto(orderUrl)
  await expect(
    page.getByText(
      "This order was cancelled because it wasn't paid in time. Place a new order if you still want these parts."
    )
  ).toBeVisible()
})

test("/dev/emails lists them, and a link opens the order in a new tab (X4, V7)", async ({
  page,
}) => {
  const response = await page.goto("/dev/emails")

  expect(response?.status()).toBe(200)
  await expect(
    page.getByRole("heading", { name: "Test emails", level: 1 })
  ).toBeVisible()
  const placed = page.getByRole("article").filter({
    hasText: `[Demo] Order ${numberA} placed`,
  })
  await expect(placed).toHaveCount(1)
  await expect(placed).toContainText(emailA)
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: `[Demo] Payment received for order ${numberA}` })
  ).toHaveCount(1)
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: `[Demo] Order ${numberB} was cancelled` })
  ).toHaveCount(1)

  // V7: the frame blocks scripts but lets a link open a new tab
  const frame = page.frameLocator(
    `iframe[title="HTML: [Demo] Order ${numberA} placed"]`
  )
  const popup = page.waitForEvent("popup")
  await frame.getByRole("link", { name: "Pay now" }).click()
  const tab = await popup

  await expect(tab).toHaveURL(
    new RegExp(`/orders/${numberA}\\?sig=[\\w-]{43}&exp=\\d{10}&p=view$`)
  )
  await expect(
    tab.getByRole("heading", { name: `Order ${numberA}`, level: 1 })
  ).toBeVisible()
  // The dev page stayed where it was
  await expect(page).toHaveURL(/\/dev\/emails$/)
})
