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
  // The space before "solid value." is a no-break space; toHaveText
  // normalizes it
  await expect(h1(page)).toHaveText(
    "Build a PC that just works, with solid tech and solid value."
  )

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

test("the hero has no buttons or links", async ({ page }) => {
  await page.goto("/")
  const hero = page.getByRole("region", { name: /^Build a PC/ })
  await expect(hero).toBeVisible()
  await expect(hero.getByRole("link")).toHaveCount(0)
  await expect(hero.getByRole("button")).toHaveCount(0)
})

test("the tiles use short labels and keep the category slugs", async ({
  page,
}) => {
  await page.goto("/")
  const tiles = region(page, "Shop by category").getByRole("link")
  await expect(tiles).toHaveText([
    "CPU",
    "Graphics Card",
    "Mobo",
    "Memory",
    "Storage",
    "Power Supply",
    "Case",
    "Cooling",
  ])
  await expect(
    region(page, "Shop by category").getByRole("link", { name: "Mobo" })
  ).toHaveAttribute("href", "/motherboard")
})

// The page content only: the header's narrow layout is later work (Phase 2)
test("nothing in the content overflows at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto("/")
  await expect(h1(page)).toHaveCSS("font-size", "40px")
  const overflowing = await page.evaluate(() =>
    [...document.querySelectorAll("main *")]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth)
      .map((el) => el.outerHTML.slice(0, 80))
  )
  expect(overflowing).toEqual([])
})

test("the header's PC Builder link opens the builder", async ({ page }) => {
  await page.goto("/")
  await page
    .getByRole("banner")
    .getByRole("link", { name: "PC Builder", exact: true })
    .click()
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
