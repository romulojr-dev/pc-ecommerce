import type { Page } from "@playwright/test"

// Shared by the category listing specs (docs/specs/008-category-listing,
// docs/specs/012-common-filters). Not a spec itself: Playwright only runs
// *.spec.ts files.

// Peso prices on the page's cards, as numbers: "₱36,995.00" -> 36995. The
// price the shopper pays: a struck-through list price sits in a paragraph that
// starts with "Was", so the anchored pattern skips it.
export async function cardPrices(page: Page): Promise<number[]> {
  const texts = await page
    .getByRole("main")
    .getByRole("article")
    .locator("p")
    .filter({ hasText: /^₱[\d,]+\.\d{2}$/ })
    .allTextContents()
  return texts.map((text) => Number(text.replace(/[₱,]/g, "")))
}

// The total in "Showing 1–24 of 61 products". (A hidden live region says the
// same with "to" instead of a dash, so this matches only the visible line.)
export async function resultCount(page: Page): Promise<number> {
  const text = await page
    .getByText(/^Showing \d+–\d+ of \d+ products?$/)
    .textContent()
  return Number(/of (\d+)/.exec(text ?? "")?.[1])
}
