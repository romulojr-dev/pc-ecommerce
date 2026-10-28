import type { Page } from "@playwright/test"

import { expect, test } from "./test"

// The home page (docs/specs/016-home-page). Needs a seeded database: one
// featured part per category, parts on sale, and AMD among the brands
// (prisma/seed/data). Which products show is covered by the integration
// tests (lib/home.db.test.ts); here it is the sections and where they lead.

const region = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true })
const h1 = (page: Page) => page.getByRole("heading", { level: 1 })

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

test("shows the sections in order", async ({ page }) => {
  await page.goto("/")
  await expect(h1(page)).toHaveText("Build a PC that just works.")

  const names = [
    "Shop by category",
    "Featured products",
    "Deals",
    "Shop by brand",
    "Why shop with PC Silicon",
  ]
  const tops: number[] = []
  for (const name of names) {
    const section = region(page, name)
    await expect(section).toBeAttached()
    tops.push((await section.boundingBox())!.y)
  }
  expect(tops).toEqual(tops.toSorted((a, b) => a - b))

  await expect(region(page, "Shop by category").getByRole("link")).toHaveCount(
    8
  )
  await expect(
    region(page, "Featured products").getByRole("article")
  ).toHaveCount(8)
  await expect(region(page, "Deals").getByRole("article")).not.toHaveCount(0)
})

test("a category tile opens its listing", async ({ page }) => {
  await page.goto("/")
  await region(page, "Shop by category")
    .getByRole("link", { name: "CPU", exact: true })
    .click()
  await expect(page).toHaveURL("/cpu")
  await expect(h1(page)).toHaveText("CPU")
})

test("a featured card opens its product page", async ({ page }) => {
  await page.goto("/")
  const link = region(page, "Featured products")
    .getByRole("article")
    .first()
    .getByRole("link")
  const name = await link.textContent()
  await link.click()
  await expect(h1(page)).toHaveText(name!)
})

test("a brand opens its search results", async ({ page }) => {
  await page.goto("/")
  await region(page, "Shop by brand")
    .getByRole("link", { name: "AMD", exact: true })
    .click()
  await expect(page).toHaveURL("/search?brand=amd")
  await expect(h1(page)).toHaveText("AMD")
})

test("the hero's calls to action", async ({ page }) => {
  await page.goto("/")

  await page.getByRole("link", { name: "Shop deals" }).click()
  await expect(page).toHaveURL(/#deals$/)
  await expect(
    region(page, "Deals").getByRole("heading", { name: "Deals" })
  ).toBeInViewport()

  // The builder is live, so the link carries no "Coming soon" badge
  await expect(page.getByText("Coming soon")).toHaveCount(0)
  await page.getByRole("link", { name: "Build your PC", exact: true }).click()
  await expect(page).toHaveURL("/builder")
  await expect(h1(page)).toHaveText("PC Builder")
})

test("View all deals lists only products on sale", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("link", { name: "View all deals" }).click()
  await expect(page).toHaveURL("/search?onSale=1")
  await expect(h1(page)).toHaveText("Deals")
  await expect(page).toHaveTitle("Deals | PC Silicon")

  const cards = page.getByRole("main").getByRole("article")
  await expect(cards.first()).toBeVisible()
  for (const card of await cards.all()) {
    await expect(card).toContainText("Was")
  }
})

test("product cards show a spec summary line", async ({ page }) => {
  await page.goto("/cpu")
  // e.g. "AM5 · 6 cores · 5.1 GHz boost"
  await expect(
    page.getByRole("main").getByRole("article").first()
  ).toContainText(/ · \d+ cores · /)
})
