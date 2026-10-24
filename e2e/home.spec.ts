import { expect, test } from "@playwright/test"

test("home page loads with the store header", async ({ page }) => {
  const response = await page.goto("/")
  expect(response?.ok()).toBe(true)
  await expect(page).toHaveTitle("PC Silicon")

  // Scoped to the header: the footer has a second logo
  const header = page.getByRole("banner")
  const logo = header.getByRole("link", { name: "PC Silicon home" })
  await expect(logo).toBeVisible()
  await expect(logo).toHaveText("pcsilicon")
  await expect(
    header.getByRole("searchbox", { name: "Search parts" })
  ).toBeVisible()

  await page.keyboard.press("Tab")
  await expect(
    page.getByRole("link", { name: "Skip to content" })
  ).toBeFocused()
})
