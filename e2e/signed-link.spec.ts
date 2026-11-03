import type { Page } from "@playwright/test"

import { enqueueEmailFor, outboxFor, viewLinkQuery } from "./orders"
import { readStock, setStock } from "./stock"
import { expect, test } from "./test"

// A signed order link opens the order like its key does, and Pay now works
// through it (docs/specs/035-email-foundation-signed-links, X1–X4). The real
// emails and the links they carry are #93's E2E.
// Needs a seeded database, ORDERS_ENABLED=true, PAYMENT_GATEWAY=fake,
// EMAIL_TRANSPORT=fake and ORDER_LINK_SECRET for the app server and for this
// process. Like the other order specs it takes real stock and leaves its
// orders behind, so it uses one part no other spec uses, sets a known stock
// first and restores the seed's after.

const CASE = "Corsair 4000D AIRFLOW Black"
const CASE_PAGE = "/case/corsair-4000d-airflow-black"
// What `pnpm db:seed` gives it (prisma/seed/data/cases.ts)
const SEED_STOCK = 10
const STOCK = 12

const ORDER_URL =
  /\/orders\/(PCS-[0-9A-HJKMNP-TV-Z]{8})\?key=[A-Za-z0-9_-]{43}$/
const FAKE_PAY_URL = /\/test-payment\/ps-[0-9a-f]{24}\?/

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  await setStock(CASE, STOCK)
})
test.afterAll(async () => {
  await setStock(CASE, SEED_STOCK)
})

// Places one case, delivered to Quezon City, and returns the order's number:
// the browser ends on the order page opened with its key
async function placeOrder(page: Page): Promise<string> {
  const counted = page.waitForResponse((r) =>
    r.url().endsWith("/api/cart/count")
  )
  await page.goto(CASE_PAGE)
  await counted
  await page.getByRole("button", { name: "Add to cart" }).click()
  await expect(page.getByText(/Added (\d+ )?to your cart\./)).toBeVisible()

  await page.goto("/cart")
  await page.getByRole("link", { name: "Checkout" }).click()
  await expect(page.getByLabel("Email")).toBeEnabled()
  await page.getByLabel("Email").fill("ana@example.com")
  await page.getByLabel("Full name").fill("Ana Santos")
  await page.getByLabel("Mobile number").fill("0917 123 4567")
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
  await page.getByRole("button", { name: "Continue to review" }).click()
  await page.getByRole("button", { name: "Place order" }).click()

  // Place order goes straight to the payment page; Back lands on the order
  await expect(page).toHaveURL(FAKE_PAY_URL)
  await page.goBack()
  await expect(page).toHaveURL(ORDER_URL)
  return ORDER_URL.exec(page.url())![1]
}

test("a signed link opens the order, without the save-the-link prompt (X1)", async ({
  page,
}) => {
  const before = await readStock(CASE)
  const number = await placeOrder(page)
  expect(await readStock(CASE)).toBe(before - 1)
  // With the key, the page offers to save the link
  await expect(page.getByText(/^Save this link:/)).toBeVisible()

  const response = await page.goto(`/orders/${number}?${viewLinkQuery(number)}`)

  expect(response?.status()).toBe(200)
  await expect(
    page.getByRole("heading", { name: `Order ${number}`, level: 1 })
  ).toBeVisible()
  await expect(page.getByText(CASE)).toBeVisible()
  await expect(
    page
      .getByRole("navigation", { name: "Order status" })
      .locator('[aria-current="step"]')
  ).toHaveText("Pending payment")
  await expect(page.getByText(/^Save this link:/)).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Copy link" })).toHaveCount(0)
  // The save-the-link prompt is the only difference: Pay now is there
  await expect(page.getByRole("button", { name: "Pay now" })).toBeVisible()
})

test("a bad link is the same 404 as a wrong key (X2)", async ({ page }) => {
  const number = await placeOrder(page)
  const good = viewLinkQuery(number)
  const flipped = good.replace(
    /sig=(.)/,
    (_, c) => `sig=${c === "A" ? "B" : "A"}`
  )

  const seen: { status: number | undefined; text: string }[] = []
  for (const path of [
    // the reference miss: a wrong key
    `/orders/${number}?key=${"A".repeat(43)}`,
    // one character of the signature
    `/orders/${number}?${flipped}`,
    // expired
    `/orders/${number}?${viewLinkQuery(number, { expiresInSeconds: -60 })}`,
    // the COD purpose, signed correctly, opens no order page here
    `/orders/${number}?${good.replace("p=view", "p=cod-confirm")}`,
    // someone else's link
    `/orders/PCS-00000000?${viewLinkQuery("PCS-00000000")}`,
    // a key and a link together
    `/orders/${number}?key=${"A".repeat(43)}&${good}`,
    // a link missing its expiry
    `/orders/${number}?${good.replace(/&exp=\d+/, "")}`,
  ]) {
    const response = await page.goto(path)
    seen.push({
      status: response?.status(),
      text: await page.locator("main").innerText(),
    })
  }
  expect(seen.map((s) => s.status)).toEqual([404, 404, 404, 404, 404, 404, 404])
  expect(new Set(seen.map((s) => s.text)).size).toBe(1)
})

test("Pay now through the link reaches the payment page and Paid (X3)", async ({
  page,
}) => {
  const number = await placeOrder(page)
  await page.goto(`/orders/${number}?${viewLinkQuery(number)}`)

  await page.getByRole("button", { name: "Pay now" }).click()

  // The fake payment page is opened with the link credential
  await expect(page).toHaveURL(
    /\/test-payment\/ps-[0-9a-f]{24}\?sig=[\w-]{43}&exp=\d{10}&p=view$/
  )
  await page.getByRole("button", { name: "Pay", exact: true }).click()

  // It returns to a signed link and the page confirms the payment
  await expect(page).toHaveURL(
    new RegExp(
      `/orders/${number}\\?sig=[\\w-]{43}&exp=\\d{10}&p=view&payment=return$`
    )
  )
  await expect(
    page
      .getByRole("navigation", { name: "Order status" })
      .locator('[aria-current="step"]')
  ).toHaveText("Paid")
})

test("a due outbox row is claimed by a page's sweep (X4)", async ({ page }) => {
  const number = await placeOrder(page)
  // No template is registered until #93: the row fails final, loudly, and the
  // order is untouched
  await enqueueEmailFor(number, "ORDER_PLACED")

  await expect(async () => {
    await page.goto("/cart")
    const rows = await outboxFor(number)
    expect(rows).toEqual([
      {
        type: "ORDER_PLACED",
        status: "FAILED",
        attempts: 5,
        lastErrorCode: "no-template",
      },
    ])
  }).toPass({ timeout: 30_000 })

  await page.goto(`/orders/${number}?${viewLinkQuery(number)}`)
  await expect(
    page
      .getByRole("navigation", { name: "Order status" })
      .locator('[aria-current="step"]')
  ).toHaveText("Pending payment")
})
