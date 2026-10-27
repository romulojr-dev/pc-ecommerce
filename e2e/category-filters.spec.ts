import type { Page } from "@playwright/test"

import { cardPrices, resultCount } from "./listing-helpers"
import { expect, test } from "./test"

// Category filters (docs/specs/012-common-filters). Needs a seeded database
// (CI seeds after migrating). Checks behaviour, not exact catalog data, so
// fixture edits don't break it. The queries themselves are covered by the
// integration tests (pnpm test:db); here it is the URL, the controls and the
// page working together. Assumes what the seed guarantees: CPUs from AMD and
// Intel, at least one CPU that isn't in stock (a pre-order), and more than 24
// GPUs (spec 011).

const sidebar = (page: Page) =>
  page.getByRole("complementary", { name: "Filters" })

test("brand and price filters change the URL and the results", async ({
  page,
}) => {
  await page.goto("/cpu")
  const all = await resultCount(page)

  // Brand: the checkbox, the URL, only that brand's cards, and a chip for it
  await sidebar(page).getByRole("checkbox", { name: "AMD" }).click()
  await expect(page).toHaveURL("/cpu?brand=amd")
  const cards = page.getByRole("main").getByRole("article")
  await expect(cards.first()).toBeVisible()
  for (const card of await cards.all()) {
    // Exact: the brand line, not "AMD Ryzen 5 7600" in the name
    await expect(card.getByText("AMD", { exact: true })).toBeVisible()
  }
  await expect(
    page.getByRole("link", { name: /Remove filter: Brand: AMD/ })
  ).toBeVisible()
  const amd = await resultCount(page)
  expect(amd).toBeGreaterThan(0)
  expect(amd).toBeLessThan(all)

  // Price: typed, applied on Enter. Sale prices count: cards show what the
  // shopper pays, which is what the filter uses.
  await sidebar(page)
    .getByRole("textbox", { name: "Max price (₱)" })
    .fill("20000")
  await sidebar(page)
    .getByRole("textbox", { name: "Max price (₱)" })
    .press("Enter")
  await expect(page).toHaveURL("/cpu?brand=amd&maxPrice=20000")
  await expect(
    page.getByRole("link", { name: /Remove filter: Price: up to ₱20,000/ })
  ).toBeVisible()
  await expect(cards.first()).toBeVisible()
  const prices = await cardPrices(page)
  expect(prices.length).toBeGreaterThan(0)
  for (const price of prices) expect(price).toBeLessThanOrEqual(20000)
  expect(await resultCount(page)).toBeLessThan(amd)

  // A reload keeps it all: the state is in the URL
  await page.reload()
  await expect(
    sidebar(page).getByRole("checkbox", { name: "AMD" })
  ).toBeChecked()
  await expect(
    sidebar(page).getByRole("textbox", { name: "Max price (₱)" })
  ).toHaveValue("20000")
})

test("filters combine with sort, and changing one goes back to page 1", async ({
  page,
}) => {
  // GPUs have two pages; every GPU costs more than ₱1,000, so this filter
  // keeps both
  await page.goto("/gpu?minPrice=1000")
  await page.getByRole("combobox", { name: "Sort by" }).click()
  await page.getByRole("option", { name: "Price: low to high" }).click()
  await expect(page).toHaveURL("/gpu?minPrice=1000&sort=price-asc")

  // The pager keeps the filter and the sort
  await page.getByRole("link", { name: "Page 2" }).click()
  await expect(page).toHaveURL("/gpu?minPrice=1000&sort=price-asc&page=2")

  // Changing a filter drops the page number and keeps the rest. The new range
  // still holds every GPU, so a stale page 2 would be valid and stay in the
  // URL; it must be dropped on purpose, not by the past-the-end redirect.
  const max = sidebar(page).getByRole("textbox", { name: "Max price (₱)" })
  await max.fill("5000000")
  await max.press("Enter")
  await expect(page).toHaveURL(
    "/gpu?minPrice=1000&maxPrice=5000000&sort=price-asc"
  )
  const prices = await cardPrices(page)
  expect(prices.length).toBe(24)
  expect(prices).toEqual(prices.toSorted((a, b) => a - b))

  // And so does choosing another sort
  await page.getByRole("combobox", { name: "Sort by" }).click()
  await page.getByRole("option", { name: "Price: high to low" }).click()
  await expect(page).toHaveURL(
    "/gpu?minPrice=1000&maxPrice=5000000&sort=price-desc"
  )
})

test("a filter can be removed, or all of them cleared", async ({ page }) => {
  await page.goto("/cpu?brand=amd&maxPrice=20000&sort=price-desc")
  const chips = page.getByRole("list", { name: "Active filters" })
  await expect(chips.getByRole("link")).toHaveCount(3) // two chips and Clear all

  // One chip: the other filter and the sort stay
  await chips.getByRole("link", { name: /Remove filter: Price/ }).click()
  await expect(page).toHaveURL("/cpu?brand=amd&sort=price-desc")
  await expect(
    sidebar(page).getByRole("textbox", { name: "Max price (₱)" })
  ).toHaveValue("")

  // Clear all: no filters, same sort
  await chips.getByRole("link", { name: "Clear all" }).click()
  await expect(page).toHaveURL("/cpu?sort=price-desc")
  await expect(chips).toHaveCount(0)
  await expect(
    sidebar(page).getByRole("checkbox", { name: "AMD" })
  ).not.toBeChecked()
})

test("in stock only drops products that can't ship now", async ({ page }) => {
  await page.goto("/cpu")
  const all = await resultCount(page)

  await sidebar(page).getByRole("checkbox", { name: "In stock only" }).click()
  await expect(page).toHaveURL("/cpu?inStock=1")
  const cards = page.getByRole("main").getByRole("article")
  await expect(cards.first()).toBeVisible()

  // Out of stock and pre-orders are gone, so there are fewer products
  await expect(cards.filter({ hasText: /Out of stock|Pre-order/ })).toHaveCount(
    0
  )
  expect(await resultCount(page)).toBeLessThan(all)
})

test("no matches says so, and a button clears the filters", async ({
  page,
}) => {
  await page.goto("/cpu?minPrice=9999999&sort=price-asc")
  await expect(
    page.getByRole("heading", { name: "No products match your filters." })
  ).toBeVisible()
  // The sidebar and chips stay, so one filter can be changed instead
  await expect(sidebar(page)).toBeVisible()
  await expect(
    page.getByRole("link", { name: /Remove filter: Price/ })
  ).toBeVisible()
  await expect(page.getByRole("article")).toHaveCount(0)
  await expect(page.getByRole("combobox", { name: "Sort by" })).toHaveCount(0)

  await page.getByRole("link", { name: "Clear all filters" }).click()
  await expect(page).toHaveURL("/cpu?sort=price-asc")
  await expect(page.getByRole("article").first()).toBeVisible()
})

test("bad filter values are ignored, and URLs are tidied", async ({ page }) => {
  // Not numbers, not a switch, not a brand the category has
  await page.goto("/cpu?minPrice=abc&inStock=yes&brand=nope")
  await expect(page).toHaveURL("/cpu")

  // A range the wrong way round is swapped
  await page.goto("/cpu?minPrice=20000&maxPrice=10000")
  await expect(page).toHaveURL("/cpu?minPrice=10000&maxPrice=20000")

  // Keys in another order, and a brand mixed with an unknown one
  await page.goto("/cpu?inStock=1&brand=nope&brand=amd")
  await expect(page).toHaveURL("/cpu?brand=amd&inStock=1")
})

test("a bad price is explained and not applied", async ({ page }) => {
  await page.goto("/cpu")
  const min = sidebar(page).getByRole("textbox", { name: "Min price (₱)" })
  await min.fill("abc")
  await min.press("Enter")

  await expect(min).toHaveAttribute("aria-invalid", "true")
  await expect(sidebar(page).getByText(/Min: Enter whole pesos/)).toBeVisible()
  await expect(page).toHaveURL("/cpu")
})

test("the sidebar works by keyboard", async ({ page }) => {
  await page.goto("/cpu")
  const amd = sidebar(page).getByRole("checkbox", { name: "AMD" })
  const intel = sidebar(page).getByRole("checkbox", { name: "Intel" })
  const min = sidebar(page).getByRole("textbox", { name: "Min price (₱)" })
  const max = sidebar(page).getByRole("textbox", { name: "Max price (₱)" })

  // Space toggles a checkbox; the results change and the focus stays on it
  await amd.focus()
  await page.keyboard.press("Space")
  await expect(page).toHaveURL("/cpu?brand=amd")
  await expect(amd).toBeChecked()
  await expect(amd).toBeFocused()

  // Tab goes on through the sidebar in reading order
  await page.keyboard.press("Tab")
  await expect(intel).toBeFocused()
  await page.keyboard.press("Space")
  await expect(page).toHaveURL("/cpu?brand=amd&brand=intel")

  // Each section's title is a button that collapses it
  await page.keyboard.press("Tab")
  await expect(
    sidebar(page).getByRole("button", { name: "Price (₱)" })
  ).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(min).toBeFocused()
  await page.keyboard.type("5000")
  await page.keyboard.press("Tab")
  await expect(max).toBeFocused()
  await page.keyboard.type("20000")

  // Typing applies nothing; Enter does, and the focus stays in the field
  await expect(page).toHaveURL("/cpu?brand=amd&brand=intel")
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(
    "/cpu?brand=amd&brand=intel&minPrice=5000&maxPrice=20000"
  )
  await expect(max).toBeFocused()
  await expect(max).toHaveValue("20000")

  // A chip is a link, so Enter removes it
  await page.getByRole("link", { name: /Remove filter: Brand: AMD/ }).focus()
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL("/cpu?brand=intel&minPrice=5000&maxPrice=20000")
})

// Base UI links a checkbox to its label only after hydration, so the markup
// the server sends must name them itself (axe: aria-toggle-field-name)
test("the checkboxes are named in the server-rendered HTML", async ({
  request,
}) => {
  const response = await request.get("/cpu")
  const html = await response.text()

  const checkboxes = html.match(/<span[^>]*role="checkbox"[^>]*>/g) ?? []
  // AMD, Intel and In stock only
  expect(checkboxes.length).toBeGreaterThanOrEqual(3)
  for (const tag of checkboxes) {
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(tag)?.[1]
    expect(labelledBy, tag).toBeTruthy()
    // ...and the label it points at is in the HTML
    expect(html).toContain(`id="${labelledBy}"`)
  }
})
