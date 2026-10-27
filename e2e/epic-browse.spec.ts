import { resultCount } from "./listing-helpers"
import { expect, test } from "./test"

// The browse epic end to end (docs/specs/013-spec-filters, "Tests"): menu →
// category → a spec filter → a product. Needs a seeded database with DDR5 kits
// in Memory (spec 011).

test("menu, category, spec filter, product", async ({ page }) => {
  await page.goto("/")

  // Menu → category
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Categories" })
    .click()
  await page.getByRole("menuitem", { name: "Memory", exact: true }).click()
  await expect(page).toHaveURL("/memory")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Memory")

  // A spec filter: the option's count is the number of results it gives
  const sidebar = page.getByRole("complementary", { name: "Filters" })
  const ddr5 = sidebar.getByRole("checkbox", { name: "DDR5" })
  const description = await ddr5.getAttribute("aria-describedby")
  const optionCount = Number(
    /\d+/.exec(
      (await page.locator(`[id="${description}"]`).textContent()) ?? ""
    )?.[0]
  )
  await ddr5.click()
  await expect(page).toHaveURL("/memory?memoryType=DDR5")
  await expect(ddr5).toBeChecked()
  await expect(
    page.getByRole("link", { name: "Remove filter: Memory type: DDR5" })
  ).toBeVisible()
  expect(await resultCount(page)).toBe(optionCount)

  // A product from the filtered list is a DDR5 kit
  const first = page.getByRole("main").getByRole("article").first()
  const name = await first.getByRole("link").textContent()
  await first.getByRole("link").click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name!)
  const specs = page.getByRole("table", { name: "Specifications" })
  await expect(
    specs.getByRole("row", { name: "Memory type DDR5" })
  ).toBeVisible()
})
