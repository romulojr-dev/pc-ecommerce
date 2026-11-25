import { builderCategories } from "../lib/specs/registry"
import { expect, test } from "./test"

// The header's category drawer. The seed creates the category rows from the
// registry, so it is the source of the expected names and order. Needs a
// seeded database (CI seeds after migrating). The current-category marker is
// tested in category-page.spec.ts.
const expectedNames = Object.values(builderCategories)
  .toSorted((a, b) => a.sortOrder - b.sortOrder)
  .map((category) => category.name)

test("category drawer opens and lists the seeded categories", async ({
  page,
}) => {
  await page.goto("/")
  const header = page.getByRole("banner")
  await header.getByRole("button", { name: "Categories" }).click()

  const drawer = page.getByRole("dialog", { name: "Categories" })
  await expect(drawer).toBeVisible()
  const nav = drawer.getByRole("navigation", { name: "Categories" })
  // The number and the animated letters are aria-hidden, so each link's name
  // is the category's name, read once
  const links = nav.getByRole("link")
  await expect(links).toHaveCount(expectedNames.length)
  for (const [i, name] of expectedNames.entries()) {
    await expect(links.nth(i)).toHaveAccessibleName(name)
  }
  // Exact: "CPU" would also match "CPU Cooler"
  await expect(
    nav.getByRole("link", { name: "CPU", exact: true })
  ).toHaveAttribute("href", "/cpu")
})

test("a category link closes the drawer", async ({ page }) => {
  await page.goto("/")
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Categories" })
    .click()
  const drawer = page.getByRole("dialog", { name: "Categories" })
  await drawer.getByRole("link", { name: "Storage", exact: true }).click()

  await expect(page).toHaveURL("/storage")
  await expect(drawer).toBeHidden()
})

test("category drawer works from the keyboard", async ({ page }) => {
  await page.goto("/")
  const trigger = page
    .getByRole("banner")
    .getByRole("button", { name: "Categories" })
  await trigger.focus()

  await page.keyboard.press("Enter")
  const drawer = page.getByRole("dialog", { name: "Categories" })
  await expect(drawer).toBeVisible()
  // Focus moves into the drawer and stays there
  await expect(drawer.locator(":focus")).toHaveCount(1)
  await page.keyboard.press("Tab")
  await expect(drawer.locator(":focus")).toHaveCount(1)

  await page.keyboard.press("Escape")
  await expect(drawer).toBeHidden()
  await expect(trigger).toBeFocused()
})
