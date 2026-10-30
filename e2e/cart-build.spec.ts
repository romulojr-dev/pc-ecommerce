import type { Page } from "@playwright/test"

import {
  BUILD_B,
  buildAItems,
  itemsFor,
  SAVED_BUILD,
  saveBuild,
} from "./build-fixtures"
import { expect, test } from "./test"

// Add build to cart (docs/specs/026-add-build-to-cart): the Builder epic's
// journey, "build → fix conflict → add to cart" (E51–E55), and adding the
// same build twice (E45). Needs a seeded database. Each test gets a fresh
// browser context, so it starts with no saved build, no cart and no cookie.

const summary = (page: Page) =>
  page.getByRole("complementary", { name: "Your build" })

const cartButton = (page: Page) =>
  summary(page).getByRole("button", { name: "Add build to cart" })

const cartLink = (page: Page) =>
  page.getByRole("navigation", { name: "Shop tools" }).getByRole("link", {
    name: /^Cart/,
  })

const WRONG_BOARD = "ASUS ROG Strix B650-A Gaming WiFi"
const RIGHT_BOARD = "MSI PRO B760M-A WiFi DDR4"

// Opens /builder with the items saved, once the page has hydrated and
// computed its status
async function openBuilder(
  page: Page,
  items: Awaited<ReturnType<typeof itemsFor>>
) {
  await page.goto("/builder")
  await saveBuild(page, items)
  await expect(summary(page)).toContainText(/Compatibility:/)
}

test("the epic: conflict → fix → acknowledge the warning → the cart shows the build (E51–E55)", async ({
  page,
  request,
}) => {
  // Build B with a board that is the wrong socket, memory type and size
  const items = await itemsFor(
    request,
    BUILD_B.map(([slot, name]) =>
      slot === "motherboard"
        ? ([slot, WRONG_BOARD] as const)
        : ([slot, name] as const)
    )
  )
  await openBuilder(page, items)

  // E51: errors block the button, and the reason is visible text
  await expect(summary(page)).toContainText(/Compatibility:\s*Errors/)
  await expect(cartButton(page)).toBeDisabled()
  await expect(cartButton(page)).toHaveAccessibleDescription(
    "Fix the errors to add this build to cart."
  )

  // E52: swap in a board that fits; only a warning is left
  await page.getByRole("button", { name: "Change Motherboard" }).click()
  const picker = page.getByRole("dialog")
  await picker
    .getByRole("button", { name: `Add ${RIGHT_BOARD} to your build` })
    .click()
  await expect(picker).toBeHidden()
  await expect(summary(page)).toContainText(/Compatibility:\s*Warnings/)
  await expect(cartButton(page)).toBeEnabled()

  // A mark that a page load would wipe
  await page.evaluate(() => {
    ;(window as unknown as { __noReload: boolean }).__noReload = true
  })

  // E46: the dialog names the warning; Cancel sends nothing
  await cartButton(page).click()
  const dialog = page.getByRole("dialog", {
    name: "Add a build with warnings?",
  })
  await expect(dialog).toContainText("may need a BIOS update")
  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(dialog).toBeHidden()
  await expect(cartButton(page)).toBeFocused()
  await expect(cartLink(page)).toHaveAccessibleName("Cart")

  // E53: acknowledge it, and the header count updates without a page load
  await cartButton(page).click()
  await dialog.getByRole("button", { name: "Add to cart" }).click()
  await expect(
    summary(page).getByText("Added your build to your cart.")
  ).toBeVisible()
  await expect(cartLink(page)).toHaveAccessibleName("Cart, 1 item")
  expect(
    await page.evaluate(
      () => (window as unknown as { __noReload?: boolean }).__noReload
    )
  ).toBe(true)
  // The local build stays as it is (Behavior 4)
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).state.items.length,
    SAVED_BUILD
  )
  expect(saved).toBe(8)

  // E54: the cart shows one grouped line that expands to the parts
  await summary(page).getByRole("link", { name: "View cart" }).click()
  await expect(page).toHaveURL("/cart")
  const group = page.getByRole("heading", { name: "Custom PC build · 8 parts" })
  await expect(group).toBeVisible()
  const line = page.getByRole("listitem").filter({ has: group })
  await expect(line).toContainText("₱74,560.00")
  await expect(line).toContainText(/Compatibility:\s*Warnings/)
  await expect(page.getByRole("heading", { name: /^Subtotal/ })).toHaveText(
    "Subtotal (1 item)"
  )
  await expect(
    line.getByRole("link", { name: "View build: Custom PC build" })
  ).toHaveAttribute("href", /^\/builds\/[a-z0-9]{10}$/)

  await line.getByRole("button", { name: "Show parts" }).click()
  for (const [, name] of BUILD_B.map(([slot, part]) =>
    slot === "motherboard" ? [slot, RIGHT_BOARD] : [slot, part]
  )) {
    await expect(line.getByText(name, { exact: true }).first()).toBeVisible()
  }
  // Parts inside a group can't be changed or removed one by one
  await expect(line.getByRole("spinbutton")).toHaveCount(0)
  await expect(line.getByRole("button", { name: /^Remove/ })).toHaveCount(1)

  // E55: removing the build removes all of it
  await line.getByRole("button", { name: "Remove Custom PC build" }).click()
  await expect(
    page.getByText("Removed Custom PC build from your cart.")
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Your cart is empty" })
  ).toBeVisible()
  await expect(cartLink(page)).toHaveAccessibleName("Cart")
})

test("adding the same build twice says it is already in the cart (E45)", async ({
  page,
  request,
}) => {
  await openBuilder(page, await buildAItems(request))
  await expect(cartButton(page)).toBeEnabled()

  // No warnings: the click sends at once, with no dialog
  await cartButton(page).click()
  await expect(
    summary(page).getByText("Added your build to your cart.")
  ).toBeVisible()
  await expect(cartLink(page)).toHaveAccessibleName("Cart, 1 item")

  await cartButton(page).click()
  await expect(
    summary(page).getByText("This build is already in your cart.")
  ).toBeVisible()
  await expect(cartLink(page)).toHaveAccessibleName("Cart, 1 item")

  // Changing the build clears the old result (E50)
  await page
    .getByRole("button", {
      name: "Remove Cooler Master MWE 550 Bronze V2 from your build",
    })
    .click()
  await expect(
    summary(page).getByText("This build is already in your cart.")
  ).toBeHidden()

  // The cart holds one group, and the build is Build A's eight parts
  await page.goto("/cart")
  await expect(
    page.getByRole("heading", { name: "Custom PC build · 8 parts" })
  ).toBeVisible()
})
