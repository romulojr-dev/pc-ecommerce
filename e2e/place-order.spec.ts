import type { Page } from "@playwright/test"

import { setFakeSessionAmount } from "./payments"
import { readStock, setStock } from "./stock"
import { expect, test } from "./test"

// Place an order and land on its page (docs/specs/030-place-an-order, X1–X7),
// by way of the fake payment page (docs/specs/031-pay-with-xendit, X1–X3), and
// pay for it (docs/specs/032-payment-webhooks, X5–X8).
// Needs a seeded database (the demo shipping rates and store included) and
// ORDERS_ENABLED=true and PAYMENT_GATEWAY=fake for the app server. These tests take real stock and
// leave their orders behind (moving local E2E off the Neon dev branch is #74),
// so they use one part no other spec uses, set a known stock first and restore
// the seed's in a `finally`/afterAll. The specs of this file run one after
// another because they share that stock.

const RIDGE = "Fractal Design Ridge Black"
const RIDGE_PAGE = "/case/fractal-design-ridge-black"
// What `pnpm db:seed` gives it (prisma/seed/data/cases.ts); it keeps the stock
// of existing products, so the specs put it back
const SEED_STOCK = 2
const STOCK = 12
const CHECKOUT_STORAGE = "pc-silicon-checkout"

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  await setStock(RIDGE, STOCK)
})
test.afterAll(async () => {
  await setStock(RIDGE, SEED_STOCK)
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

async function addRidge(page: Page) {
  await open(page, RIDGE_PAGE)
  await page.getByRole("button", { name: "Add to cart" }).click()
  await expect(page.getByText(/Added (\d+ )?to your cart\./)).toBeVisible()
}

async function startCheckout(page: Page) {
  await page.goto("/cart")
  await page.getByRole("link", { name: "Checkout" }).click()
  await expect(page).toHaveURL("/checkout")
  await expect(page.getByLabel("Email")).toBeEnabled()
}

async function fillContact(page: Page) {
  await page.getByLabel("Email").fill("ana@example.com")
  await page.getByLabel("Full name").fill("Ana Santos")
  await page.getByLabel("Mobile number").fill("0917 123 4567")
}

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

// From /cart to the review of one Ridge, delivered to Quezon City
async function reviewDelivery(page: Page) {
  await addRidge(page)
  await startCheckout(page)
  await fillContact(page)
  await fillQuezonCity(page)
  await page.getByRole("button", { name: "Continue to review" }).click()
  await expect(
    page.getByRole("heading", { name: "Review your order", level: 2 })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Place order" })).toBeEnabled()
}

const ORDER_URL = /\/orders\/PCS-[0-9A-HJKMNP-TV-Z]{8}\?key=[A-Za-z0-9_-]{43}$/
const FAKE_PAY_URL = /\/test-payment\/ps-[0-9a-f]{24}\?key=[A-Za-z0-9_-]{43}$/

// Place order goes straight to the payment page (spec 031, Behavior 1)
async function placeToPayment(page: Page, click = true) {
  if (click) await page.getByRole("button", { name: "Place order" }).click()
  await expect(page).toHaveURL(FAKE_PAY_URL)
  await expect(
    page.getByRole("heading", { name: "Test payment, not Xendit" })
  ).toBeVisible()
}

// ...and Back from it lands on the order, not on the checkout (spec 031, X1)
async function placeAndGoBack(page: Page) {
  await placeToPayment(page)
  await page.goBack()
  await expect(page).toHaveURL(ORDER_URL)
}

test("place an order and land on its page (X1, X2)", async ({ page }) => {
  await reviewDelivery(page)

  await placeAndGoBack(page)

  // X1: the order, from its snapshots
  const number = /PCS-[0-9A-HJKMNP-TV-Z]{8}/.exec(page.url())![0]
  await expect(
    page.getByRole("heading", { name: `Order ${number}`, level: 1 })
  ).toBeVisible()
  await expect(page.getByText(RIDGE)).toBeVisible()
  await expect(page.getByText("₱6,995.00 × 1")).toBeVisible()
  const summary = page.getByRole("complementary", { name: "Order summary" })
  await expect(summary.getByText("₱6,995.00")).toBeVisible()
  // 5 kg to Metro Manila: the 10 kg tier
  await expect(summary.getByText("₱300.00")).toBeVisible()
  await expect(summary.getByText("₱7,295.00")).toBeVisible()
  await expect(page.getByText("12 Mabini St")).toBeVisible()
  await expect(
    page.getByText("Alicia, Quezon City, Metro Manila, National Capital Region")
  ).toBeVisible()
  await expect(
    page.getByText(/Pay by \w{3} \d{1,2} \w{3} \d{4}, /)
  ).toBeVisible()
  await expect(
    page.getByText(
      "Save this link to see your order. We're also emailing you a link to it; if it doesn't arrive, this one still works."
    )
  ).toBeVisible()
  await expect(
    page
      .getByRole("navigation", { name: "Order status" })
      .locator('[aria-current="step"]')
  ).toHaveText("Pending payment")

  // X2: the cart, the header, the saved details and the stock
  await expect(
    page.getByRole("link", { name: "Cart", exact: true })
  ).toBeVisible()
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), CHECKOUT_STORAGE)
  ).toBeNull()
  await page.goto("/checkout")
  await expect(page).toHaveURL("/cart")
  await expect(page.getByText("Your cart is empty")).toBeVisible()
  expect(await readStock(RIDGE)).toBe(STOCK - 1)
})

test("a double click on Place order makes one order (X3)", async ({ page }) => {
  const before = await readStock(RIDGE)
  await reviewDelivery(page)

  const place = page.getByRole("button", { name: "Place order" })
  await place.dblclick()
  await placeToPayment(page, false)

  // One order, one unit gone: the second click did nothing
  await page.goto("/cart")
  await expect(page.getByText("Your cart is empty")).toBeVisible()
  expect(await readStock(RIDGE)).toBe(before - 1)
})

test("stock gone since the review says so and places nothing (X4)", async ({
  page,
}) => {
  await reviewDelivery(page)

  await setStock(RIDGE, 0)
  try {
    await page.getByRole("button", { name: "Place order" }).click()

    await expect(
      page.getByText("Your order changed. Review it again.")
    ).toBeVisible()
    // The reloaded review blocks, with the reason and the way out
    await expect(
      page.getByRole("heading", {
        name: "1 problem to fix before you can order",
      })
    ).toBeVisible()
    await expect(page.getByText(`${RIDGE}: Out of stock`)).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Back to cart" })
    ).toHaveAttribute("href", "/cart")
    await expect(
      page.getByRole("button", { name: "Place order" })
    ).toBeDisabled()
    await expect(page).toHaveURL(/\/checkout\?step=review$/)
  } finally {
    await setStock(RIDGE, STOCK)
  }
})

test("a wrong key is the same 404 as an unknown order (X5)", async ({
  page,
}) => {
  await reviewDelivery(page)
  await placeAndGoBack(page)
  const url = new URL(page.url())
  const key = "A".repeat(43)

  // The same status and the same page for a wrong key, an unknown number and
  // no key. The raw HTML carries each request's own URL, so compare what the
  // shopper sees.
  const seen: { status: number | undefined; text: string }[] = []
  for (const path of [
    `${url.pathname}?key=${key}`,
    `/orders/PCS-00000000?key=${key}`,
    url.pathname,
    `/orders/not-an-order?key=${key}`,
  ]) {
    const response = await page.goto(path)
    seen.push({
      status: response?.status(),
      text: await page.locator("main").innerText(),
    })
  }
  expect(seen.map((s) => s.status)).toEqual([404, 404, 404, 404])
  expect(new Set(seen.map((s) => s.text)).size).toBe(1)

  // The right link opens without the cart cookie, with the headers that keep
  // its key private
  const good = await page.request.get(url.pathname + url.search)
  expect(good.status()).toBe(200)
  expect(good.headers()["cache-control"]).toContain("no-store")
  expect(good.headers()["referrer-policy"]).toBe("no-referrer")
  expect(await good.text()).toMatch(/<meta name="robots" content="noindex/)
})

test("Copy link copies the order's address (X6)", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await reviewDelivery(page)
  await placeAndGoBack(page)

  await page.getByRole("button", { name: "Copy link" }).click()

  await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    page.url()
  )
  await expect(page.getByLabel("Your order link")).toHaveValue(page.url())
})

test("a pickup order shows the store (X7)", async ({ page }) => {
  await addRidge(page)
  await startCheckout(page)
  await fillContact(page)
  await page.getByLabel("Store pickup").check()
  await page.getByRole("button", { name: "Continue to review" }).click()
  await expect(
    page.getByRole("heading", { name: "Review your order", level: 2 })
  ).toBeVisible()

  await placeAndGoBack(page)

  await expect(page.getByRole("heading", { name: "Pick up at" })).toBeVisible()
  await expect(page.getByText("PC Silicon Demo Store")).toBeVisible()
  await expect(
    page.getByText(
      "Bring your order number and a valid ID when you collect your order."
    )
  ).toBeVisible()
  await expect(page.getByText("Free (pickup)")).toBeVisible()
  await expect(page.getByText("Delivery address")).toHaveCount(0)
})

// docs/specs/031-pay-with-xendit, X2–X4: the fake gateway stands in for
// Xendit; nothing marks Paid before #80

test("cancel on the payment page, then retry (X2, X3)", async ({ page }) => {
  await reviewDelivery(page)
  await placeToPayment(page)
  const first = new URL(page.url()).pathname

  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(page).toHaveURL(/&payment=cancelled$/)
  await expect(
    page.getByText("Payment not completed. You haven't been charged.")
  ).toBeVisible()
  await expect(page.getByText(/^Test mode\./)).toBeVisible()
  await expect(page.getByText(/test page, not Xendit/)).toBeVisible()

  // X3: a new session, and a second cancel offers Retry again
  await page.getByRole("button", { name: "Retry payment" }).click()
  await expect(page).toHaveURL(FAKE_PAY_URL)
  expect(new URL(page.url()).pathname).not.toBe(first)
  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(
    page.getByRole("button", { name: "Retry payment" })
  ).toBeVisible()

  // The first session is closed: its page says so
  const key = new URL(page.url()).searchParams.get("key")
  await page.goto(`${first}?key=${key}`)
  await expect(page.getByText("This test payment is closed.")).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Back to your order" })
  ).toBeVisible()
})

// docs/specs/032-payment-webhooks, X5–X8: the fake's Pay and Let it expire
// run the webhook handler, which confirms through the fake gateway

const currentStep = (page: Page) =>
  page
    .getByRole("navigation", { name: "Order status" })
    .locator('[aria-current="step"]')

test("checkout → paid: Pay marks the order Paid (X5)", async ({ page }) => {
  await reviewDelivery(page)
  await placeToPayment(page)

  await page.getByRole("button", { name: "Pay", exact: true }).click()

  await expect(page).toHaveURL(/&payment=return$/)
  await expect(currentStep(page)).toHaveText("Paid")
  await expect(
    page.getByText(
      /^Paid on \w{3} \d{1,2} \w{3} \d{4}, .+ with the test payment page\.$/
    )
  ).toBeVisible()
  await expect(page.getByText(/^Test mode\./)).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Pay now" })).toHaveCount(0)
  await expect(page.getByText("Confirming your payment…")).toHaveCount(0)
})

test("an expired session offers Retry, then paying works (X6, X7)", async ({
  page,
}) => {
  await reviewDelivery(page)
  await placeToPayment(page)

  await page.getByRole("button", { name: "Let it expire" }).click()

  await expect(page).toHaveURL(/&payment=cancelled$/)
  await expect(
    page.getByText("Payment not completed. You haven't been charged.")
  ).toBeVisible()
  // X6: still Retry without the payment value, from the expired session
  const url = new URL(page.url())
  url.searchParams.delete("payment")
  await page.goto(url.pathname + url.search)
  await expect(
    page.getByText("Payment not completed. You haven't been charged.")
  ).toBeVisible()

  // X7
  await page.getByRole("button", { name: "Retry payment" }).click()
  await expect(page).toHaveURL(FAKE_PAY_URL)
  await page.getByRole("button", { name: "Pay", exact: true }).click()
  await expect(currentStep(page)).toHaveText("Paid")
})

test("a payment of the wrong amount needs checking (X8)", async ({ page }) => {
  await reviewDelivery(page)
  await placeToPayment(page)

  // One centavo short of the ₱7,295.00 total, as no real Xendit payment is
  const session = /ps-[0-9a-f]{24}/.exec(page.url())![0]
  await setFakeSessionAmount(session, 729_499)
  await page.getByRole("button", { name: "Pay", exact: true }).click()

  await expect(
    page.getByText(
      "We received a payment that needs checking. We'll contact you."
    )
  ).toBeVisible()
  await expect(currentStep(page)).toHaveText("Pending payment")
  await expect(page.getByRole("button", { name: "Pay now" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Retry payment" })).toHaveCount(
    0
  )
})

test("Pay now opens a payment from the order page", async ({ page }) => {
  await reviewDelivery(page)
  await placeAndGoBack(page)

  await page.getByRole("button", { name: "Pay now" }).click()
  await expect(page).toHaveURL(FAKE_PAY_URL)
})
