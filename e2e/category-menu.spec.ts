import { expect, test } from "@playwright/test"

import { builderCategories } from "../lib/specs/registry"

// The seed creates the category rows from the registry, so it is the source of
// the expected names and order. Needs a seeded database (CI seeds after
// migrating). The current-category marker is tested with the category pages
// (#21), once /<slug> exists.
const expectedNames = Object.values(builderCategories)
  .toSorted((a, b) => a.sortOrder - b.sortOrder)
  .map((category) => category.name)

test("category menu opens and lists the seeded categories", async ({
  page,
}) => {
  await page.goto("/")
  const header = page.getByRole("banner")
  await header.getByRole("button", { name: "Categories" }).click()

  const menu = page.getByRole("menu", { name: "Categories" })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole("menuitem")).toHaveText(expectedNames)
  // Exact: "CPU" would also match "CPU Cooler"
  await expect(
    menu.getByRole("menuitem", { name: "CPU", exact: true })
  ).toHaveAttribute("href", "/cpu")
})

test("category menu works from the keyboard", async ({ page }) => {
  await page.goto("/")
  const trigger = page
    .getByRole("banner")
    .getByRole("button", { name: "Categories" })
  await trigger.focus()

  await page.keyboard.press("Enter")
  const menu = page.getByRole("menu", { name: "Categories" })
  const items = menu.getByRole("menuitem")
  await expect(items.first()).toBeFocused()

  await page.keyboard.press("ArrowDown")
  await expect(items.nth(1)).toBeFocused()

  await page.keyboard.press("Escape")
  await expect(menu).toBeHidden()
  await expect(trigger).toBeFocused()
})
