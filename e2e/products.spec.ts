import { expect, test } from "@playwright/test"

// Needs a seeded database (CI seeds after migrating). Checks only that a known
// seed product is listed with a peso price; exact prices and stock statuses
// are covered by the unit tests, so fixture edits don't break this.
test("products page lists seeded products with peso prices", async ({
  page,
}) => {
  const response = await page.goto("/products")
  expect(response?.ok()).toBe(true)
  await expect(page).toHaveTitle("Products | PC Silicon")

  const row = page.getByRole("row", { name: /AMD Ryzen 5 7600/ })
  await expect(row).toBeVisible()
  await expect(row).toContainText(/₱[\d,]+\.\d{2}/)
})
