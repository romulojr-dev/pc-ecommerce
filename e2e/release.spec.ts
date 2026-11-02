import type { Page } from "@playwright/test"

import { dueOrdersHolding, setExpiresAt } from "./orders"
import { readStock, setStock } from "./stock"
import { expect, test } from "./test"

// An unpaid order past its deadline is cancelled and its parts come back
// (docs/specs/033-release-unpaid-orders, X1, X2). Needs a seeded database and
// ORDERS_ENABLED=true and PAYMENT_GATEWAY=fake for the app server. Like
// place-order.spec.ts, these take real stock and leave their orders behind
// (#74), so they use one part no other spec uses, at a known stock, and
// restore the seed's afterwards. The specs run one after another because
// they share that stock.

const NORTH = "Fractal Design North Charcoal Black"
const NORTH_PAGE = "/case/fractal-design-north-charcoal-black"
// What `pnpm db:seed` gives it (prisma/seed/data/cases.ts)
const SEED_STOCK = 3

test.describe.configure({ mode: "serial" })

test.beforeEach(async ({ page }) => {
  // An expired order a failed run left behind would give its unit back in
  // the middle of a test: let a sweep release it first
  await expect(async () => {
    await page.goto("/cart")
    expect(await dueOrdersHolding(NORTH)).toBe(0)
  }).toPass({ timeout: 30_000 })
  // One unit: the order takes it, so the product page shows the change
  await setStock(NORTH, 1)
})
test.afterAll(async () => {
  await setStock(NORTH, SEED_STOCK)
})

const ORDER_URL = /\/orders\/PCS-[0-9A-HJKMNP-TV-Z]{8}\?key=[A-Za-z0-9_-]{43}$/
const FAKE_PAY_URL = /\/test-payment\/ps-[0-9a-f]{24}\?key=[A-Za-z0-9_-]{43}$/
const EXPIRED =
  "This order was cancelled because it wasn't paid in time. Place a new order if you still want these parts."
const addToCart = (page: Page) =>
  page.getByRole("button", { name: "Add to cart" })

// Places a pickup order of the one North and stops on the fake payment page
async function placeNorth(page: Page): Promise<string> {
  const counted = page.waitForResponse((r) =>
    r.url().endsWith("/api/cart/count")
  )
  await page.goto(NORTH_PAGE)
  await counted
  await addToCart(page).click()
  await expect(page.getByText(/Added (\d+ )?to your cart\./)).toBeVisible()

  await page.goto("/cart")
  await page.getByRole("link", { name: "Checkout" }).click()
  await expect(page.getByLabel("Email")).toBeEnabled()
  await page.getByLabel("Email").fill("ana@example.com")
  await page.getByLabel("Full name").fill("Ana Santos")
  await page.getByLabel("Mobile number").fill("0917 123 4567")
  await page.getByLabel("Store pickup").check()
  await page.getByRole("button", { name: "Continue to review" }).click()
  await page.getByRole("button", { name: "Place order" }).click()
  await expect(page).toHaveURL(FAKE_PAY_URL)
  expect(await readStock(NORTH)).toBe(0)

  // The order's link is where Back lands (spec 031)
  await page.goBack()
  await expect(page).toHaveURL(ORDER_URL)
  return /PCS-[0-9A-HJKMNP-TV-Z]{8}/.exec(page.url())![0]
}

test("an unpaid order past its deadline gives its part back (X1)", async ({
  page,
}) => {
  const number = await placeNorth(page)
  const orderUrl = page.url()
  await expect(page.getByRole("button", { name: "Pay now" })).toBeVisible()

  await setExpiresAt(number, new Date(Date.now() - 60_000))

  // The order page shows it cancelled at once, whatever the row says
  await page.goto(orderUrl)
  await expect(page.getByText(EXPIRED)).toBeVisible()
  await expect(page.getByRole("button", { name: "Pay now" })).toHaveCount(0)
  await expect(page.getByText(/^Test mode\./)).toHaveCount(0)

  // The sweep runs after a page's response: the next load sees the stock
  await page.goto(NORTH_PAGE)
  await expect(async () => {
    await page.reload()
    await expect(addToCart(page)).toBeEnabled({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  expect(await readStock(NORTH)).toBe(1)
})

test("a paid order stays paid past its deadline (X2)", async ({ page }) => {
  const number = await placeNorth(page)
  await page.getByRole("button", { name: "Pay now" }).click()
  await expect(page).toHaveURL(FAKE_PAY_URL)
  await page.getByRole("button", { name: "Pay", exact: true }).click()
  await expect(page).toHaveURL(/&payment=return$/)
  const step = page
    .getByRole("navigation", { name: "Order status" })
    .locator('[aria-current="step"]')
  await expect(step).toHaveText("Paid")
  const orderUrl = page.url()

  await setExpiresAt(number, new Date(Date.now() - 60_000))
  await page.goto(NORTH_PAGE)
  await page.reload()
  await page.goto(orderUrl)

  await expect(step).toHaveText("Paid")
  await expect(page.getByText(EXPIRED)).toHaveCount(0)
  expect(await readStock(NORTH)).toBe(0)
})
