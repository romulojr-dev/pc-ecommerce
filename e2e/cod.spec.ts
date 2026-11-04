import { randomBytes } from "node:crypto"

import type { Page } from "@playwright/test"

import {
  dueOrdersHolding,
  fakeEmailsFor,
  orderLinkPathFor,
  setExpiresAt,
} from "./orders"
import { readCodMaxTotal, setCodMaxTotal } from "./settings"
import { readStock, setStock } from "./stock"
import { expect, test } from "./test"

// Cash on delivery, confirmed by email (docs/specs/038-cash-on-delivery,
// X1–X7). Needs a seeded database (the demo COD settings and shipping rates
// included), ORDERS_ENABLED=true, PAYMENT_GATEWAY=fake, EMAIL_TRANSPORT=fake
// and ORDER_LINK_SECRET. Like the other order specs these take real stock and
// leave their orders behind (moving local E2E off the Neon dev branch is #74),
// so they use one part no other spec places orders with, set a known stock
// first and restore the seed's afterwards. They run one after another because
// they share that stock and the COD limit.

const AIR100 = "Montech AIR 100 ARGB Black"
const AIR100_PAGE = "/case/montech-air-100-argb-black"
// What `pnpm db:seed` gives it (prisma/seed/data/cases.ts)
const SEED_STOCK = 16
const STOCK = 12

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  await setStock(AIR100, STOCK)
})
test.afterAll(async () => {
  await setStock(AIR100, SEED_STOCK)
})

// Opens a page once the header's count request has been answered (see
// cart.spec.ts)
async function open(page: Page, path: string) {
  const counted = page.waitForResponse((r) =>
    r.url().endsWith("/api/cart/count")
  )
  await page.goto(path)
  await counted
}

// Each order has its own recipient: the sender's cap is five emails a day per
// address (spec 035, 036)
const recipient = () => `cod-${randomBytes(4).toString("hex")}@example.com`

const ORDER_URL =
  /\/orders\/(PCS-[0-9A-HJKMNP-TV-Z]{8})\?key=[A-Za-z0-9_-]{43}$/

async function fillQuezonCity(page: Page) {
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

// From the product page to the review of one Montech AIR 100 ARGB: delivered to
// Quezon City (₱2,995.00 and ₱300.00 shipping), or picked up in store
async function review(page: Page, email: string, pickup = false) {
  await open(page, AIR100_PAGE)
  await page.getByRole("button", { name: "Add to cart" }).click()
  await expect(page.getByText(/Added (\d+ )?to your cart\./)).toBeVisible()
  await page.goto("/cart")
  await page.getByRole("link", { name: "Checkout" }).click()
  await expect(page).toHaveURL("/checkout")
  await expect(page.getByLabel("Email")).toBeEnabled()
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Full name").fill("Ana Santos")
  await page.getByLabel("Mobile number").fill("0917 123 4567")
  if (pickup) await page.getByLabel("Store pickup").check()
  else await fillQuezonCity(page)
  await page.getByRole("button", { name: "Continue to review" }).click()
  await expect(
    page.getByRole("heading", { name: "Review your order", level: 2 })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Place order" })).toBeEnabled()
}

const cashRadio = (page: Page) =>
  page.getByRole("radio", { name: /Cash on delivery|Pay on pickup/ })
const onlineRadio = (page: Page) =>
  page.getByRole("radio", { name: /Pay online/ })

// Choosing is a request for a new review; the answer settles the radio
async function chooseCash(page: Page) {
  await cashRadio(page).click()
  await expect(cashRadio(page)).toBeChecked()
  await expect(page.getByRole("button", { name: "Place order" })).toBeEnabled()
}

const summary = (page: Page) =>
  page.getByRole("complementary", { name: "Order summary" })

const currentStep = (page: Page) =>
  page
    .getByRole("navigation", { name: "Order status" })
    .locator('[aria-current="step"]')

// A cash order, placed from the review: lands on the order page, with no
// payment page in between
async function placeCash(page: Page, pickup = false) {
  const email = recipient()
  await review(page, email, pickup)
  await chooseCash(page)
  await page.getByRole("button", { name: "Place order" }).click()
  await expect(page).toHaveURL(ORDER_URL)
  const url = page.url()
  const number = ORDER_URL.exec(url)![1]
  return { email, number, url }
}

// The email the fake transport recorded for the order's recipient
async function confirmationEmail(email: string) {
  await expect
    .poll(async () => (await fakeEmailsFor(email)).length, { timeout: 20_000 })
    .toBeGreaterThan(0)
  return (await fakeEmailsFor(email))[0]
}

test("choose cash, place the order and land on its page with the email on its way (X1, X7)", async ({
  page,
}) => {
  const email = recipient()
  await review(page, email)

  // Both options; cash is offered for a ₱3,295.00 order in Metro Manila
  await expect(onlineRadio(page)).toBeChecked()
  await expect(cashRadio(page)).toBeEnabled()
  await chooseCash(page)
  await expect(summary(page).getByText("Cash on delivery")).toBeVisible()
  await expect(
    page.getByText(
      "Confirm your order from the email we send you, or it is cancelled."
    )
  ).toBeVisible()

  await page.getByRole("button", { name: "Place order" }).click()

  // No payment page: straight to the order, waiting for confirmation (X1)
  await expect(page).toHaveURL(ORDER_URL)
  const number = ORDER_URL.exec(page.url())![1]
  await expect(
    page.getByRole("heading", { name: `Order ${number}`, level: 1 })
  ).toBeVisible()
  await expect(currentStep(page)).toHaveText("Pending confirmation")
  await expect(page.getByRole("button", { name: "Pay now" })).toHaveCount(0)

  // X7: where to look, and what happens if it doesn't arrive
  await expect(
    page.getByText(
      /Check your email \(from [^)]+\) to confirm this order\. If it doesn't arrive, the order cancels itself at .+ and you can place a new one\./
    )
  ).toBeVisible()
  await expect(
    summary(page).getByText("Cash on delivery", { exact: true })
  ).toBeVisible()

  // The one email, from the fake transport, names its action
  const mail = await confirmationEmail(email)
  expect(mail.subject).toBe(
    `[Demo] Confirm your cash-on-delivery order ${number}`
  )
  expect(mail.text).toContain("Confirm order")
  expect(orderLinkPathFor(mail.text, "cod-confirm")).toContain(number)
  expect(await fakeEmailsFor(email)).toHaveLength(1)
})

test("open the emailed link, confirm, and see it confirmed everywhere (X2)", async ({
  page,
}) => {
  const { email, url } = await placeCash(page)
  const mail = await confirmationEmail(email)
  const confirmPath = orderLinkPathFor(mail.text, "cod-confirm")

  // Opening the link (what a mail scanner does) changes nothing
  await page.goto(confirmPath)
  await expect(
    page.getByRole("heading", { name: "Confirm your order", level: 1 })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Confirm order" })
  ).toBeVisible()
  await page.goto(url)
  await expect(currentStep(page)).toHaveText("Pending confirmation")

  // The button is the POST
  await page.goto(confirmPath)
  await page.getByRole("button", { name: "Confirm order" }).click()
  await expect(page.getByText("Order confirmed. Thank you.")).toBeVisible()

  await page.goto(url)
  await expect(currentStep(page)).toContainText("COD confirmed")
  await expect(
    page.getByRole("navigation", { name: "Order status" })
  ).toContainText(/Confirmed \w{3} \d+ \w{3} 2\d{3}, \d+:\d{2} [AP]M/)
  await expect(
    page.getByText(
      /You confirmed this order\. Pay ₱[\d,.]+ in cash when it arrives\./
    )
  ).toBeVisible()
  await expect(page.getByText(/Check your email/)).toHaveCount(0)

  // The link again: already confirmed, no button
  await page.goto(confirmPath)
  await expect(page.getByText("This order is already confirmed.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Confirm order" })).toHaveCount(
    0
  )
})

test("an order nobody confirms is released, its stock returns and the shopper is told (X3)", async ({
  page,
}) => {
  const before = await readStock(AIR100)
  const { email, number, url } = await placeCash(page)
  expect(await readStock(AIR100)).toBe(before - 1)
  const mail = await confirmationEmail(email)
  const confirmPath = orderLinkPathFor(mail.text, "cod-confirm")

  // Its deadline passes
  await setExpiresAt(number, new Date(Date.now() - 60_000))

  // The page reads it as cancelled at once, and releases it after the response
  await page.goto(url)
  await expect(currentStep(page)).toHaveText("Cancelled")
  await expect(
    page.getByText(
      "This order was cancelled because it wasn't confirmed in time. Place a new order if you still want these parts."
    )
  ).toBeVisible()
  await expect.poll(() => readStock(AIR100), { timeout: 20_000 }).toBe(before)
  expect(await dueOrdersHolding(AIR100)).toBe(0)

  // The email says why
  await expect
    .poll(async () => (await fakeEmailsFor(email)).length, { timeout: 20_000 })
    .toBe(2)
  const [, cancelled] = await fakeEmailsFor(email)
  expect(cancelled.text).toContain("wasn't confirmed in time")

  // And the confirm link now shows the cancelled view, with no button
  await page.goto(confirmPath)
  await expect(
    page.getByText(
      "This order was cancelled because it wasn't confirmed in time."
    )
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Confirm order" })).toHaveCount(
    0
  )
})

test("over the limit, cash is disabled with the reason and online still works (X4)", async ({
  page,
}) => {
  const original = await readCodMaxTotal()
  await setCodMaxTotal(100_000)
  try {
    await review(page, recipient())

    await expect(cashRadio(page)).toBeDisabled()
    await expect(
      page.getByText(
        "Cash on delivery is for orders up to ₱1,000.00. Your total is ₱3,295.00."
      )
    ).toBeVisible()
    await expect(onlineRadio(page)).toBeEnabled()
    await expect(onlineRadio(page)).toBeChecked()
    await expect(
      page.getByRole("button", { name: "Place order" })
    ).toBeEnabled()
  } finally {
    await setCodMaxTotal(original)
  }
})

test("pay on pickup: place, see it on the order, read it in the email (X5)", async ({
  page,
}) => {
  const { email, url } = await placeCash(page, true)

  await expect(summary(page).getByText("Pay on pickup")).toBeVisible()
  await expect(currentStep(page)).toHaveText("Pending confirmation")

  const mail = await confirmationEmail(email)
  expect(mail.subject).toContain("pay-on-pickup")
  expect(mail.text).toContain("in cash at the store when you collect it.")

  // confirm it, and the page says where to pay
  await page.goto(orderLinkPathFor(mail.text, "cod-confirm"))
  await page.getByRole("button", { name: "Confirm order" }).click()
  await expect(page.getByText("Order confirmed. Thank you.")).toBeVisible()
  await page.goto(url)
  await expect(page.getByText(/in cash when you collect it\./)).toBeVisible()
})

test("the choice survives going back to the details and returning (X6)", async ({
  page,
}) => {
  await review(page, recipient())
  await chooseCash(page)

  await page.getByRole("link", { name: "Back to details" }).click()
  await expect(page).toHaveURL("/checkout")
  await expect(page.getByLabel("Email")).toBeEnabled()
  await page.getByRole("button", { name: "Continue to review" }).click()

  await expect(
    page.getByRole("heading", { name: "Review your order", level: 2 })
  ).toBeVisible()
  await expect(cashRadio(page)).toBeChecked()
  await expect(summary(page).getByText("Cash on delivery")).toBeVisible()
})
