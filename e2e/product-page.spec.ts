import { expect, test } from "./test"

// Product detail page (docs/specs/010-product-page). Needs a seeded database
// (CI seeds after migrating). Checks behaviour, not exact prices or stock, so
// fixture edits don't break it.

test("the menu leads through a category to a product page", async ({
  page,
}) => {
  await page.goto("/")
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Categories" })
    .click()
  // Exact: "CPU" would also match "CPU Cooler"
  await page.getByRole("menuitem", { name: "CPU", exact: true }).click()
  await expect(page).toHaveURL("/cpu")

  // The first product in the list: the catalog grows, this test shouldn't care
  const first = page.getByRole("article").first().getByRole("link")
  const name = (await first.innerText()).trim()
  await first.click()

  await expect(page).toHaveURL(/^http:\/\/[^/]+\/cpu\/[a-z0-9-]+$/)
  await expect(page).toHaveTitle(`${name} | PC Silicon`)
  await expect(
    page.getByRole("heading", { level: 1, name, exact: true })
  ).toBeVisible()
  await expect(page.getByRole("main")).toContainText(/₱[\d,]+\.\d{2}/)

  const specs = page.getByRole("table", { name: "Specifications" })
  await expect(specs.getByRole("row", { name: /^Socket / })).toBeVisible()

  // shadcn gives the current page role="link" too, so pick the real link
  await expect(
    page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "CPU", exact: true })
  ).toHaveAttribute("href", "/cpu")
})

test("an unknown product is a 404", async ({ page }) => {
  const response = await page.goto("/cpu/no-such-product")
  expect(response?.status()).toBe(404)
})

test("a product under the wrong category redirects to its real URL", async ({
  page,
}) => {
  const response = await page.goto("/gpu/amd-ryzen-5-7600")
  expect(response?.request().redirectedFrom()?.url()).toMatch(
    /\/gpu\/amd-ryzen-5-7600$/
  )
  await expect(page).toHaveURL("/cpu/amd-ryzen-5-7600")
})

test("the gallery works with the keyboard", async ({ page }) => {
  // Seeded with three images
  await page.goto("/gpu/gigabyte-geforce-rtx-5070-windforce-oc-sff-12g")
  const enlarge = page.getByRole("button", { name: "Enlarge image" })
  const second = page.getByRole("button", { name: "Show image 2 of 3" })

  await enlarge.focus()
  await page.keyboard.press("Tab")
  await page.keyboard.press("Tab")
  await expect(second).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(second).toHaveAttribute("aria-pressed", "true")
  await expect(enlarge.getByRole("img")).toHaveAttribute("alt", /in the box$/)

  await enlarge.focus()
  await page.keyboard.press("Enter")
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText("2 of 3")
  await page.keyboard.press("ArrowRight")
  await expect(dialog).toContainText("3 of 3")

  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(enlarge).toBeFocused()
})

test("a pre-order shows its ship date; cart and builder are disabled", async ({
  page,
}) => {
  await page.goto("/gpu/msi-geforce-rtx-5060-ti-16g-ventus-2x-oc-plus")
  await expect(
    page.getByText(/^Pre-order: ships \w+ \d+, \d{4}$/)
  ).toBeVisible()

  for (const name of ["Add to cart", "Add to build"]) {
    const button = page.getByRole("button", { name })
    await expect(button).toBeDisabled()
    await expect(button).toHaveAccessibleDescription(
      "Cart and PC Builder are coming soon."
    )
  }
})
