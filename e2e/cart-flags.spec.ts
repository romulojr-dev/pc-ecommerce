import type { Page } from "@playwright/test"

import { itemsFor, SAVED_BUILD, saveBuild } from "./build-fixtures"
import { setStock } from "./stock"
import { expect, test } from "./test"

// Stock flags on the cart page (docs/specs/027-cart-stock-flags, E26–E28).
// Needs a seeded database. Stock can only drop under a cart after the add
// (every add is capped), so the test lowers it in the database, and restores
// it in a `finally`. The part is one no other spec uses.

const PSU = "MSI MAG A650BN 650W"
const PSU_PAGE = "/psu/msi-mag-a650bn-650w"
const SEED_STOCK = 20

const cartLink = (page: Page) =>
  page.getByRole("navigation", { name: "Shop tools" }).getByRole("link", {
    name: /^Cart/,
  })

// Opens a page once the header's count request has been answered; a click
// before that is lost (see cart.spec.ts)
async function open(page: Page, path: string) {
  const counted = page.waitForResponse((r) =>
    r.url().endsWith("/api/cart/count")
  )
  await page.goto(path)
  await counted
}

test("flags, the banner and Set to, then out of stock (E26–E28)", async ({
  page,
  request,
}) => {
  await setStock(PSU, SEED_STOCK)
  try {
    // The cart: the PSU × 2 as a single line, and a build of the PSU alone
    await open(page, PSU_PAGE)
    await page.getByRole("button", { name: "Increase quantity" }).click()
    await page.getByRole("button", { name: "Add to cart" }).click()
    await expect(page.getByText("Added to your cart.")).toBeVisible()

    await page.goto("/builder")
    await saveBuild(page, await itemsFor(request, [["psu", PSU]]))
    const summary = page.getByRole("complementary", { name: "Your build" })
    await expect(summary).toContainText(/Compatibility:/)
    await summary.getByRole("button", { name: "Add build to cart" }).click()
    await expect(
      summary.getByText("Added your build to your cart.")
    ).toBeVisible()
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).state.items.length,
        SAVED_BUILD
      )
    ).toBe(1)

    // E26: the stock drops under the cart, so 3 units are held against 2
    await setStock(PSU, 2)
    await open(page, "/cart")
    await expect(
      page.getByText(
        "2 lines need attention. Fix or remove them before you check out."
      )
    ).toBeVisible()
    const single = page
      .getByRole("listitem")
      .filter({ has: page.getByLabel(`Quantity of ${PSU}`) })
    await expect(single).toContainText("Only 2 in stock, 3 in your cart")
    const group = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: /^Custom PC build/ }) })
    await expect(group).toContainText(`${PSU}: Only 2 in stock, 3 in your cart`)
    // A group can only be removed; the single line can be set to what fits
    await expect(group.getByRole("button", { name: /^Set / })).toHaveCount(0)

    // E27: Set to 1 clears both flags, without a page load
    await page.evaluate(() => {
      ;(window as unknown as { __noReload: boolean }).__noReload = true
    })
    await single.getByRole("button", { name: `Set ${PSU} to 1` }).click()
    await expect(page.getByText(`Set ${PSU} to 1.`)).toBeVisible()
    await expect(page.getByText(/need attention|needs attention/)).toBeHidden()
    await expect(single).not.toContainText("Only 2 in stock")
    await expect(group).not.toContainText("Only 2 in stock")
    await expect(cartLink(page)).toHaveAccessibleName("Cart, 2 items")
    await expect(
      page.getByRole("spinbutton", { name: `Quantity of ${PSU}` })
    ).toBeFocused()
    expect(
      await page.evaluate(
        () => (window as unknown as { __noReload?: boolean }).__noReload
      )
    ).toBe(true)

    // E28: out of stock flags both lines; removing them leaves the banner
    // counting what is left, then an empty cart
    await setStock(PSU, 0)
    await page.reload()
    await expect(
      page.getByText(
        "2 lines need attention. Fix or remove them before you check out."
      )
    ).toBeVisible()
    await expect(single).toContainText("Out of stock")
    await expect(group).toContainText(`${PSU}: Out of stock`)

    await single.getByRole("button", { name: `Remove ${PSU}` }).click()
    await expect(
      page.getByText(
        "1 line needs attention. Fix or remove it before you check out."
      )
    ).toBeVisible()
    await group.getByRole("button", { name: "Remove Custom PC build" }).click()
    await expect(
      page.getByRole("heading", { name: "Your cart is empty" })
    ).toBeVisible()
  } finally {
    await setStock(PSU, SEED_STOCK)
  }
})
