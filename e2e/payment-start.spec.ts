import type { Page } from "@playwright/test"

import { dueOrdersHolding, openPayments, setExpiresAt } from "./orders"
import { setStock } from "./stock"
import { expect, test } from "./test"

// Pay now from two tabs at once (docs/specs/034-start-payment-outside-
// transaction, W4): each tab ends on a payment page, only the newest session
// stays open, and the order has one open payment. Needs a seeded database and
// ORDERS_ENABLED=true and PAYMENT_GATEWAY=fake for the app server. It takes
// real stock, so it uses one part no other spec uses, at a known stock, and
// releases its order and restores the seed's stock afterwards.

const H7 = "NZXT H7 Flow Black"
const H7_PAGE = "/case/nzxt-h7-flow-black"
// What `pnpm db:seed` gives it (prisma/seed/data/cases.ts)
const SEED_STOCK = 14

const ORDER_URL = /\/orders\/PCS-[0-9A-HJKMNP-TV-Z]{8}\?key=[A-Za-z0-9_-]{43}$/
const FAKE_PAY_URL = /\/test-payment\/ps-[0-9a-f]{24}\?key=[A-Za-z0-9_-]{43}$/

test.beforeEach(async () => {
  await setStock(H7, 5)
})
test.afterAll(async () => {
  await setStock(H7, SEED_STOCK)
})

// Places a pickup order of one H7 and comes back to the order page
async function placeH7(page: Page): Promise<string> {
  const counted = page.waitForResponse((r) =>
    r.url().endsWith("/api/cart/count")
  )
  await page.goto(H7_PAGE)
  await counted
  await page.getByRole("button", { name: "Add to cart" }).click()
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
  await page.goBack()
  await expect(page).toHaveURL(ORDER_URL)
  return /PCS-[0-9A-HJKMNP-TV-Z]{8}/.exec(page.url())![0]
}

test("Pay now in two tabs leaves one open session (W4)", async ({
  page,
  context,
}) => {
  const number = await placeH7(page)
  const other = await context.newPage()
  await other.goto(page.url())

  const tabs = [page, other]
  for (const tab of tabs) {
    await expect(tab.getByRole("button", { name: "Pay now" })).toBeVisible()
  }
  await Promise.all(
    tabs.map((tab) => tab.getByRole("button", { name: "Pay now" }).click())
  )
  for (const tab of tabs) await expect(tab).toHaveURL(FAKE_PAY_URL)
  expect(page.url()).not.toBe(other.url())

  // The tab whose session the other one replaced shows it closed
  const closed = []
  for (const tab of tabs) {
    await tab.reload()
    await expect(tab.getByRole("heading", { level: 1 })).toBeVisible()
    closed.push(await tab.getByText("This test payment is closed.").isVisible())
  }
  expect(closed.filter(Boolean)).toHaveLength(1)
  expect(await openPayments(number)).toBe(1)

  // Leave nothing held: past its deadline, a sweep releases the order
  await setExpiresAt(number, new Date(Date.now() - 60_000))
  await expect(async () => {
    await page.goto("/cart")
    expect(await dueOrdersHolding(H7)).toBe(0)
  }).toPass({ timeout: 30_000 })
})
