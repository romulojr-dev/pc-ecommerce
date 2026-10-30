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
