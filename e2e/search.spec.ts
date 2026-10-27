import type { Page } from "@playwright/test"

import { resultCount } from "./listing-helpers"
import { expect, test } from "./test"

// Keyword search (docs/specs/014-search). Needs a seeded database. The
// queries themselves are covered by the integration tests (pnpm test:db,
// with fixtures of their own); here it is the header box, the URL, the
// controls and the pages working together. Assumes what the seed
// guarantees: several RTX 5070 cards, ASUS among their brands, AMD CPUs, and
// DDR5 kits and DDR5 boards (spec 011).

const headerBox = (page: Page) =>
  page.getByRole("banner").getByRole("searchbox", { name: "Search parts" })
const sidebar = (page: Page) =>
  page.getByRole("complementary", { name: "Filters" })
const cards = (page: Page) => page.getByRole("main").getByRole("article")

test("header search, results, a filter, a product", async ({ page }) => {
  await page.goto("/")

  // Header → results: the box keeps the query
  await headerBox(page).fill("rtx 5070")
  await headerBox(page).press("Enter")
  await expect(page).toHaveURL("/search?q=rtx+5070")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Results for “rtx 5070”"
  )
  await expect(headerBox(page)).toHaveValue("rtx 5070")
  await expect(cards(page).first()).toBeVisible()
  for (const card of await cards(page).all()) {
    await expect(card.getByRole("link")).toHaveText(/5070/)
  }
  const all = await resultCount(page)

  // A brand filter keeps the query
  await sidebar(page).getByRole("checkbox", { name: "ASUS" }).click()
  await expect(page).toHaveURL("/search?q=rtx+5070&brand=asus")
  await expect(
    page.getByRole("link", { name: "Remove filter: Brand: ASUS" })
  ).toBeVisible()
  for (const card of await cards(page).all()) {
    await expect(card.getByText("ASUS", { exact: true })).toBeVisible()
  }
  expect(await resultCount(page)).toBeLessThan(all)

  // A result opens its product page; the box is empty there
  const link = cards(page).first().getByRole("link")
  const name = await link.textContent()
  await link.click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name!)
  await expect(headerBox(page)).toHaveValue("")
})

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false })

  test("the header box submits, and the results page keeps the query", async ({
    page,
  }) => {
    await page.goto("/cpu")
    // Untidy input: the page redirects to the cleaned query
    await headerBox(page).fill("  rtx   5070 ")
    await headerBox(page).press("Enter")
    await expect(page).toHaveURL("/search?q=rtx+5070")
    await expect(headerBox(page)).toHaveValue("rtx 5070")
    await expect(cards(page).first()).toBeVisible()
  })
})

test("the category filter's count is the number of results it gives", async ({
  page,
}) => {
  await page.goto("/search?q=ddr5")
  const categories = sidebar(page).getByRole("group", { name: "Category" })
  await expect(
    categories.getByRole("checkbox", { name: "Motherboard" })
  ).toBeVisible()

  const memory = categories.getByRole("checkbox", { name: "Memory" })
  const description = await memory.getAttribute("aria-describedby")
  const optionCount = Number(
    /\d+/.exec(
      (await page.locator(`[id="${description}"]`).textContent()) ?? ""
    )?.[0]
  )
  await memory.click()
  await expect(page).toHaveURL("/search?q=ddr5&category=memory")
  await expect(memory).toBeChecked()
  expect(await resultCount(page)).toBe(optionCount)

  // Clear all removes the filter, not the query
  await page.getByRole("link", { name: "Clear all" }).click()
  await expect(page).toHaveURL("/search?q=ddr5")
})

test("a brand without a query lists that brand (Shop by brand)", async ({
  page,
}) => {
  await page.goto("/search?brand=amd")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("AMD")
  await expect(headerBox(page)).toHaveValue("")
  await expect(cards(page).first()).toBeVisible()
  for (const card of await cards(page).all()) {
    await expect(card.getByText("AMD", { exact: true })).toBeVisible()
  }
})

test("the empty search page suggests searches", async ({ page }) => {
  await page.goto("/search")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Search")
  await page.getByRole("link", { name: "RTX 5070" }).click()
  await expect(page).toHaveURL("/search?q=RTX+5070")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Results for “RTX 5070”"
  )
})

test("a query with no results says so and offers categories", async ({
  page,
}) => {
  await page.goto("/search?q=zzqqxx")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "No results for “zzqqxx”"
  )
  await expect(cards(page)).toHaveCount(0)
  await page
    .getByRole("navigation", { name: "Browse a category" })
    .getByRole("link", { name: "Memory" })
    .click()
  await expect(page).toHaveURL("/memory")
})

test("untidy URLs redirect to the canonical one", async ({ page }) => {
  await page.goto("/search?q=++rtx+5070+&sort=relevance")
  await expect(page).toHaveURL("/search?q=rtx+5070")
  await page.goto("/search?q=")
  await expect(page).toHaveURL("/search")
})

test("search pages are not indexed; category pages are", async ({ page }) => {
  const robots = page.locator('meta[name="robots"]')
  for (const url of ["/search", "/search?q=rtx", "/search?brand=amd"]) {
    await page.goto(url)
    await expect(robots).toHaveAttribute("content", "noindex, follow")
  }
  await page.goto("/cpu")
  await expect(robots).toHaveCount(0)
})
