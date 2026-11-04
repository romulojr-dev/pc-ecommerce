import { randomBytes } from "node:crypto"

import type { Page } from "@playwright/test"

import { fakeEmailsFor } from "./orders"
import { setStock } from "./stock"
import { expect, test } from "./test"
import {
  deleteVoucher,
  insertVoucher,
  setVoucherEndsAt,
  throwawayCode,
  voucherUses,
} from "./vouchers"

// Vouchers at the review (docs/specs/037-vouchers-at-checkout, X1–X4). Needs a
// seeded database (the demo codes and shipping rates included),
// ORDERS_ENABLED=true and PAYMENT_GATEWAY=fake. These tests take real stock and
// leave their orders behind (moving local E2E off the Neon dev branch is #74),
// so they use one part no other spec uses, set a known stock first and restore
// the seed's afterwards. The specs of this file run one after another because
// they share that stock.

const O11 = "Lian Li O11 Dynamic EVO Black"
const O11_PAGE = "/case/lian-li-o11-dynamic-evo-black"
// What `pnpm db:seed` gives it (prisma/seed/data/cases.ts)
const SEED_STOCK = 5
const STOCK = 12

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  await setStock(O11, STOCK)
})
test.afterAll(async () => {
  await setStock(O11, SEED_STOCK)
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
const recipient = () => `voucher-${randomBytes(4).toString("hex")}@example.com`

// From the product page to the review, picking up in store
async function reviewPickup(page: Page, email: string) {
  await open(page, O11_PAGE)
  await page.getByRole("button", { name: "Add to cart" }).click()
  await expect(page.getByText(/Added (\d+ )?to your cart\./)).toBeVisible()
  await page.goto("/cart")
  await page.getByRole("link", { name: "Checkout" }).click()
  await expect(page).toHaveURL("/checkout")
  await expect(page.getByLabel("Email")).toBeEnabled()
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Full name").fill("Ana Santos")
  await page.getByLabel("Mobile number").fill("0917 123 4567")
  await page.getByLabel("Store pickup").check()
  await page.getByRole("button", { name: "Continue to review" }).click()
  await expect(
    page.getByRole("heading", { name: "Review your order", level: 2 })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Place order" })).toBeEnabled()
}

const summary = (page: Page) =>
  page.getByRole("complementary", { name: "Order summary" })

async function apply(page: Page, code: string) {
  await page.getByLabel("Voucher code").fill(code)
  await page.getByRole("button", { name: "Apply" }).click()
}

const ORDER_URL = /\/orders\/PCS-[0-9A-HJKMNP-TV-Z]{8}\?key=[A-Za-z0-9_-]{43}$/
const FAKE_PAY_URL = /\/test-payment\/ps-[0-9a-f]{24}\?key=[A-Za-z0-9_-]{43}$/

test("apply a code, place the order and see the discount (X1)", async ({
  page,
}) => {
  const email = recipient()
  const usedBefore = await voucherUses("WELCOME10")
  await reviewPickup(page, email)

  // ₱9,495.00 less 10 %: ₱949.50 off, ₱8,545.50 to pay
  await apply(page, " welcome10 ")
  await expect(summary(page).getByText("WELCOME10 applied")).toBeVisible()
  await expect(summary(page).getByText("Discount (WELCOME10)")).toBeVisible()
  await expect(summary(page).getByText("−₱949.50")).toBeVisible()
  await expect(summary(page).getByText("₱8,545.50")).toBeVisible()

  await page.getByRole("button", { name: "Place order" }).click()
  await expect(page).toHaveURL(FAKE_PAY_URL)
  await page.goBack()
  await expect(page).toHaveURL(ORDER_URL)

  // The order page names the voucher and totals the discount
  const order = page.getByRole("complementary", { name: "Order summary" })
  await expect(order.getByText("Discount (WELCOME10)")).toBeVisible()
  await expect(order.getByText("−₱949.50")).toBeVisible()
  await expect(order.getByText("₱8,545.50")).toBeVisible()
  expect(await voucherUses("WELCOME10")).toBe(usedBefore + 1)

  // The Order placed email shows the same row
  await expect
    .poll(async () => (await fakeEmailsFor(email)).length, { timeout: 15_000 })
    .toBeGreaterThan(0)
  const [placed] = await fakeEmailsFor(email)
  expect(placed.text).toContain("Discount (WELCOME10)")
  expect(placed.text).toContain("−₱949.50")
})

test("a refused code says why, and Remove clears an applied one (X2)", async ({
  page,
}) => {
  await reviewPickup(page, recipient())

  // Nothing typed
  await page.getByRole("button", { name: "Apply" }).click()
  await expect(page.getByText("Enter a code.")).toBeVisible()

  // A code nobody made: the text stays so it can be fixed
  await apply(page, "NOPE")
  await expect(
    page.getByText("We don't recognize that code. Check it and try again.")
  ).toBeVisible()
  await expect(page.getByLabel("Voucher code")).toHaveValue("NOPE")
  await expect(summary(page).getByText("Discount")).toHaveCount(0)

  // A real code the cart is too small for: ₱10,000.00 against ₱9,495.00
  await apply(page, "SAVE500")
  await expect(
    page.getByText("Spend ₱505.00 more to use this code.")
  ).toBeVisible()

  // Then a good one, and Remove
  await apply(page, "WELCOME10")
  await expect(summary(page).getByText("Discount (WELCOME10)")).toBeVisible()
  await expect(page.getByRole("button", { name: "Remove" })).toBeFocused()

  await page.getByRole("button", { name: "Remove" }).click()
  await expect(summary(page).getByText("Discount")).toHaveCount(0)
  await expect(page.getByLabel("Voucher code")).toHaveValue("")
  await expect(page.getByLabel("Voucher code")).toBeFocused()
  await expect(summary(page).getByText("₱9,495.00").last()).toBeVisible()
})

test("an applied code is still applied after going back to step 1 (X3)", async ({
  page,
}) => {
  await reviewPickup(page, recipient())
  await apply(page, "WELCOME10")
  await expect(summary(page).getByText("WELCOME10 applied")).toBeVisible()

  await page.getByRole("link", { name: "Back to details" }).click()
  await expect(page).toHaveURL("/checkout")
  await expect(page.getByLabel("Email")).toBeEnabled()
  await page.getByRole("button", { name: "Continue to review" }).click()

  await expect(summary(page).getByText("WELCOME10 applied")).toBeVisible()
  await expect(summary(page).getByText("Discount (WELCOME10)")).toBeVisible()
})

test("a code that ended while the review was open says so on Check again (X4)", async ({
  page,
}) => {
  const code = throwawayCode()
  await insertVoucher(code)
  try {
    await reviewPickup(page, recipient())
    await apply(page, code)
    await expect(summary(page).getByText(`${code} applied`)).toBeVisible()

    await setVoucherEndsAt(code, new Date(Date.now() - 60_000))
    await page.getByRole("button", { name: "Check again" }).click()

    await expect(page.getByText("That code has ended.")).toBeVisible()
    await expect(page.getByLabel("Voucher code")).toHaveValue(code)
    await expect(summary(page).getByText("Discount")).toHaveCount(0)
    // Nothing is placed with it: Place order still works, without the code
    await expect(
      page.getByRole("button", { name: "Place order" })
    ).toBeEnabled()
  } finally {
    await deleteVoucher(code)
  }
})
