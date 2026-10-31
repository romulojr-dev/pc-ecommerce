import type { Page } from "@playwright/test"

import { readStock, setStock } from "./stock"
import { expect, test } from "./test"

// Place an order and land on its page (docs/specs/030-place-an-order, X1–X7).
// Needs a seeded database (the demo shipping rates and store included) and
// ORDERS_ENABLED=true for the app server. These tests take real stock and
// leave their orders behind (moving local E2E off the Neon dev branch is #74),
// so they use one part no other spec uses, set a known stock first and restore
// the seed's in a `finally`/afterAll. The specs of this file run one after
// another because they share that stock.

const RIDGE = "Fractal Design Ridge Black"
const RIDGE_PAGE = "/case/fractal-design-ridge-black"
// What `pnpm db:seed` gives it (prisma/seed/data/cases.ts); it keeps the stock
// of existing products, so the specs put it back
const SEED_STOCK = 2
const STOCK = 8
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

test("place an order and land on its page (X1, X2)", async ({ page }) => {
  await reviewDelivery(page)

  await page.getByRole("button", { name: "Place order" }).click()
  await expect(page).toHaveURL(ORDER_URL)

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
      "Save this link: it's the only way to see your order until order emails arrive."
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
  await expect(page).toHaveURL(ORDER_URL)

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
  await page.getByRole("button", { name: "Place order" }).click()
  await expect(page).toHaveURL(ORDER_URL)
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
  await page.getByRole("button", { name: "Place order" }).click()
  await expect(page).toHaveURL(ORDER_URL)

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

  await page.getByRole("button", { name: "Place order" }).click()
  await expect(page).toHaveURL(ORDER_URL)

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
