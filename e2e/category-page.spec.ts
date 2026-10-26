import { expect, type Page, test } from "@playwright/test"

// Category listing (docs/specs/008-category-listing). Needs a seeded database
// (CI seeds after migrating). Checks behaviour, not exact prices or stock, so
// fixture edits don't break it. CPU and GPU have two pages; paging itself is
// covered by the unit tests (lib/listing-params.test.ts).

// Peso prices on the page's cards, as numbers: "₱36,995.00" -> 36995
async function cardPrices(page: Page): Promise<number[]> {
  const texts = await page
    .getByRole("main")
    .getByRole("article")
    .getByText(/^₱[\d,]+\.\d{2}$/)
    .allTextContents()
  return texts.map((text) => Number(text.replace(/[₱,]/g, "")))
}

test("the category menu leads to a category's product cards", async ({
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
  await expect(page).toHaveTitle("CPU | PC Silicon")
  await expect(
    page.getByRole("heading", { level: 1, name: "CPU" })
  ).toBeVisible()

  // Whichever product comes first: the catalog grows, this test shouldn't care
  const card = page.getByRole("article").first()
  const name = (await card.getByRole("heading").innerText()).trim()
  await expect(card).toContainText(/AMD|Intel/)
  await expect(card).toContainText(/₱[\d,]+\.\d{2}/)
  await expect(card).toContainText(/In stock|Low stock|Out of stock|Pre-order/)
  await expect(card.getByRole("link", { name, exact: true })).toHaveAttribute(
    "href",
    /^\/cpu\/[a-z0-9-]+$/
  )

  // The image has the product's alt text and actually loads. Images below the
  // first row load lazily, so scroll the card into view first.
  const image = card.getByRole("img", { name })
  await image.scrollIntoViewIfNeeded()
  await expect
    .poll(() =>
      image.evaluate((img: HTMLImageElement) =>
        img.complete ? img.naturalWidth : 0
      )
    )
    .toBeGreaterThan(0)
})

// Deferred from docs/specs/007-category-menu until /<slug> existed
test("the category menu marks the current category", async ({ page }) => {
  await page.goto("/cpu")
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Categories" })
    .click()

  const menu = page.getByRole("menu", { name: "Categories" })
  const current = menu.getByRole("menuitem", { name: "CPU", exact: true })
  await expect(current).toHaveAttribute("aria-current", "page")
  // The check icon is aria-hidden, so it has no role to locate it by
  await expect(current.locator("svg.lucide-check")).toHaveCount(1)

  // No other item is marked
  await expect(menu.locator("[aria-current]")).toHaveCount(1)
  await expect(menu.locator("svg.lucide-check")).toHaveCount(1)
})

test("sorting by price is kept in the URL", async ({ page }) => {
  await page.goto("/cpu")
  await page.getByRole("combobox", { name: "Sort by" }).click()
  await page.getByRole("option", { name: "Price: high to low" }).click()

  await expect(page).toHaveURL("/cpu?sort=price-desc")
  const prices = await cardPrices(page)
  expect(prices.length).toBeGreaterThan(1)
  expect(prices).toEqual(prices.toSorted((a, b) => b - a))

  await page.reload()
  // toContainText: the trigger's text also holds its chevron icon
  await expect(page.getByRole("combobox", { name: "Sort by" })).toContainText(
    "Price: high to low"
  )
  expect(await cardPrices(page)).toEqual(prices)
})

test("invalid and out-of-range parameters fall back to the canonical URL", async ({
  page,
}) => {
  await page.goto("/cpu?sort=bogus&page=abc")
  await expect(page).toHaveURL("/cpu")

  // Past the last page goes to the last page: 26 CPUs, 24 per page
  await page.goto("/cpu?page=99")
  await expect(page).toHaveURL("/cpu?page=2")
})

test("the grid/list choice is remembered", async ({ page }) => {
  await page.goto("/cpu")
  const view = page.getByRole("group", { name: "View" })
  await expect(view.getByRole("button", { name: "Grid" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )

  await view.getByRole("button", { name: "List" }).click()
  await expect(view.getByRole("button", { name: "List" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )

  // A full page load of another category keeps it (a cookie, not the URL)
  await page.goto("/gpu")
  await expect(page).toHaveURL("/gpu")
  await expect(view.getByRole("button", { name: "List" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
})

test("unknown categories and the removed /products page are 404s", async ({
  page,
}) => {
  for (const path of ["/no-such-category", "/products"]) {
    const response = await page.goto(path)
    expect(response?.status(), path).toBe(404)
  }
})
