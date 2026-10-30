import type { Page } from "@playwright/test"

import { expect, test } from "./test"

// The cart (docs/specs/025-cart-single-items). Needs a seeded database. Each
// test gets a fresh browser context, so it starts with no cart and no cookie;
// the first add writes one cart to the database the dev server uses.

const RYZEN = "/cpu/amd-ryzen-5-7600"
const OUT_OF_STOCK = "/cpu/amd-ryzen-7-5800x3d"

// Opens a page once the header's count request has been answered. That request
// is made after hydration, so the buttons work by then (a click before that is
// lost).
async function open(page: Page, path: string) {
  const counted = page.waitForResponse((r) =>
    r.url().endsWith("/api/cart/count")
  )
  await page.goto(path)
  await counted
}

const cartLink = (page: Page) =>
  page.getByRole("navigation", { name: "Shop tools" }).getByRole("link", {
    name: /^Cart/,
  })

test("Add to cart updates the header count without a page load (E33)", async ({
  page,
}) => {
  await open(page, RYZEN)
  await expect(cartLink(page)).toHaveAccessibleName("Cart")

  // A mark that a page load would wipe
  await page.evaluate(() => {
    ;(window as unknown as { __noReload: boolean }).__noReload = true
  })
  await page.getByRole("button", { name: "Increase quantity" }).click()
  await page.getByRole("button", { name: "Add to cart" }).click()

  await expect(page.getByText("Added to your cart.")).toBeVisible()
  await expect(page.getByRole("link", { name: "View cart" })).toBeVisible()
  await expect(cartLink(page)).toHaveAccessibleName("Cart, 2 items")
  await expect(cartLink(page)).toContainText("2")
  expect(
    await page.evaluate(
      () => (window as unknown as { __noReload?: boolean }).__noReload
    )
  ).toBe(true)

  // The cookie is the cart: it is httpOnly, Secure, SameSite=Lax (Behavior 2)
  const cookies = await page.context().cookies()
  expect(cookies.find((c) => c.name === "__Host-cart")).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
  })
})

test("a part that is out of stock can't be added to the cart (E37)", async ({
  page,
}) => {
  await page.goto(OUT_OF_STOCK)

  const add = page.getByRole("button", { name: "Add to cart" })
  await expect(add).toBeDisabled()
  await expect(add).toHaveAccessibleDescription(
    "Only parts in stock can be added to your cart or build."
  )
  await expect(
    page.getByRole("spinbutton", { name: "Quantity" })
  ).toBeDisabled()
  await expect(
    page.getByRole("button", { name: "Add to build" })
  ).toBeDisabled()
})

test("add two, change to one, remove: the cart and the header agree (E33–E36)", async ({
  page,
}) => {
  await open(page, RYZEN)
  await page.getByRole("button", { name: "Increase quantity" }).click()
  await page.getByRole("button", { name: "Add to cart" }).click()
  await expect(cartLink(page)).toHaveAccessibleName("Cart, 2 items")

  await page.getByRole("link", { name: "View cart" }).click()
  await expect(page).toHaveURL("/cart")
  await expect(
    page.getByRole("heading", { name: "Cart", level: 1 })
  ).toBeVisible()

  // One line at 2: the total is two units at the seed price
  const line = page
    .getByRole("listitem")
    .filter({ hasText: "AMD Ryzen 5 7600" })
  await expect(line).toHaveCount(1)
  await expect(line.getByText("In stock")).toBeVisible()
  await expect(line.getByText("₱22,990.00")).toBeVisible()
  const summary = page.getByRole("complementary", { name: "Order summary" })
  await expect(summary.getByText("Subtotal (2 items)")).toBeVisible()
  await expect(summary.getByText("₱22,990.00")).toBeVisible()
  await expect(summary.getByRole("link", { name: "Checkout" })).toHaveAttribute(
    "href",
    "/checkout"
  )

  // Down to one: the line, the subtotal and the header follow
  await page
    .getByRole("button", { name: "Decrease quantity of AMD Ryzen 5 7600" })
    .click()
  await expect(
    page.getByRole("spinbutton", { name: "Quantity of AMD Ryzen 5 7600" })
  ).toHaveValue("1")
  await expect(summary.getByText("Subtotal (1 item)")).toBeVisible()
  await expect(summary.getByText("₱11,495.00")).toBeVisible()
  await expect(cartLink(page)).toHaveAccessibleName("Cart, 1 item")

  // Remove it: announced, then the empty state, with focus on its heading
  await page.getByRole("button", { name: "Remove AMD Ryzen 5 7600" }).click()
  await expect(
    page.getByText("Removed AMD Ryzen 5 7600 from your cart.")
  ).toBeVisible()
  const empty = page.getByRole("heading", { name: "Your cart is empty" })
  await expect(empty).toBeVisible()
  await expect(empty).toBeFocused()
  await expect(cartLink(page)).toHaveAccessibleName("Cart")
  await expect(
    page.getByRole("link", { name: "Open the PC Builder" })
  ).toBeVisible()
})

test("a visitor with no cart sees the empty state, and no cookie is made (E29)", async ({
  page,
  context,
}) => {
  await page.goto("/cart")

  await expect(
    page.getByRole("heading", { name: "Your cart is empty" })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Checkout" })).toHaveCount(0)
  expect(
    (await context.cookies()).find((c) => c.name === "__Host-cart")
  ).toBeUndefined()
})

test("the home page stays static: it sets no cookie, and the badge comes after it loads (E38)", async ({
  page,
}) => {
  await open(page, RYZEN)
  await page.getByRole("button", { name: "Add to cart" }).click()
  await expect(cartLink(page)).toHaveAccessibleName("Cart, 1 item")

  const counted = page.waitForResponse((r) =>
    r.url().endsWith("/api/cart/count")
  )
  const response = await page.goto("/")
  expect(response?.headers()["set-cookie"]).toBeUndefined()
  await counted

  await expect(cartLink(page)).toHaveAccessibleName("Cart, 1 item")
})
