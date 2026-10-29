import type { Browser, Page } from "@playwright/test"

import { expect, test } from "./test"

// Sharing a build (docs/specs/022-share-build). Needs a seeded database. The
// first share of a build writes one row to the database the dev server uses;
// sharing the same contents again reuses it. Every test starts with an empty
// saved build: each gets a fresh browser context.

const RYZEN = "/cpu/amd-ryzen-5-7600"
const LINK = /\/builds\/[a-z0-9]{10}$/

async function addRyzenAndOpenBuilder(page: Page) {
  await page.goto(RYZEN)
  await page.getByRole("button", { name: "Add to build" }).click()
  await page.getByRole("link", { name: "View build" }).click()
  await expect(page).toHaveURL("/builder")
  await expect(page.getByRole("button", { name: "Share build" })).toBeEnabled()
}

const shareDialog = (page: Page) =>
  page.getByRole("dialog", { name: "Share your build" })

test("an empty build can't be shared, and says why (E39)", async ({ page }) => {
  await page.goto("/builder")
  const share = page.getByRole("button", { name: "Share build" })
  await expect(share).toBeDisabled()
  await expect(page.getByText("Add parts to share your build.")).toBeVisible()
  await expect(share).toHaveAccessibleDescription(
    "Add parts to share your build."
  )
})

test("sharing shows a selected link, and Copy link announces it (E40, E41)", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await addRyzenAndOpenBuilder(page)

  await page.getByRole("button", { name: "Share build" }).click()
  const dialog = shareDialog(page)
  await expect(dialog).toBeVisible()

  const field = dialog.getByRole("textbox", { name: "Share link" })
  await expect(field).toHaveValue(LINK)
  const url = await field.inputValue()
  expect(url.startsWith("http://localhost:3000/builds/")).toBe(true)
  // Selected and focused, so Ctrl+C works where the button can't
  await expect(field).toBeFocused()

  await dialog.getByRole("button", { name: "Copy link" }).click()
  await expect(dialog.getByRole("status")).toHaveText("Link copied")
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url)
})

test("the same contents give the same link, and closing returns focus (E43)", async ({
  page,
}) => {
  await addRyzenAndOpenBuilder(page)
  const share = page.getByRole("button", { name: "Share build" })

  await share.click()
  const field = shareDialog(page).getByRole("textbox", { name: "Share link" })
  await expect(field).toHaveValue(LINK)
  const first = await field.inputValue()

  await page.keyboard.press("Escape")
  await expect(shareDialog(page)).toBeHidden()
  await expect(share).toBeFocused()

  await share.click()
  await expect(field).toHaveValue(LINK)
  expect(await field.inputValue()).toBe(first)

  await shareDialog(page).getByRole("button", { name: "Close" }).click()
  await expect(shareDialog(page)).toBeHidden()
})

test("a failed share shows an alert and Try again works (E45)", async ({
  page,
}) => {
  await addRyzenAndOpenBuilder(page)
  // Server actions are POSTs to the page; fail the first one
  let failed = false
  await page.route("**/builder", async (route) => {
    if (route.request().method() === "POST" && !failed) {
      failed = true
      await route.abort()
      return
    }
    await route.continue()
  })

  await page.getByRole("button", { name: "Share build" }).click()
  const dialog = shareDialog(page)
  await expect(dialog.getByRole("alert")).toContainText(
    "We couldn't create a link. Try again."
  )
  expect(
    await page.evaluate(() => localStorage.getItem("pc-silicon-build"))
  ).not.toBeNull()

  await dialog.getByRole("button", { name: "Try again" }).click()
  await expect(dialog.getByRole("textbox", { name: "Share link" })).toHaveValue(
    LINK
  )
})

// Shares the Ryzen 5 7600 alone and returns the link's path
async function shareRyzen(page: Page) {
  await addRyzenAndOpenBuilder(page)
  await page.getByRole("button", { name: "Share build" }).click()
  const field = shareDialog(page).getByRole("textbox", { name: "Share link" })
  await expect(field).toHaveValue(LINK)
  return new URL(await field.inputValue()).pathname
}

// Opens a path the way someone else would: a browser context with no saved
// build, cookies or storage
async function asVisitor(browser: Browser, path: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const response = await page.goto(path)
  return { page, response, close: () => context.close() }
}

test("a shared link shows the build to someone else, read-only (E24, E25)", async ({
  page,
  browser,
}) => {
  const path = await shareRyzen(page)

  const visitor = await asVisitor(browser, path)
  try {
    const view = visitor.page
    expect(visitor.response?.status()).toBe(200)
    await expect(
      view.getByRole("heading", { name: "Shared PC build" })
    ).toBeVisible()
    const cpu = view.getByRole("listitem").filter({
      has: view.getByRole("heading", { name: "CPU", exact: true }),
    })
    await expect(
      cpu.getByRole("link", { name: "AMD Ryzen 5 7600", exact: true })
    ).toBeVisible()
    await expect(view.getByText("No part chosen")).toHaveCount(7)

    const summary = view.getByRole("complementary", { name: "Summary" })
    await expect(summary).toContainText("₱11,495.00")
    await expect(summary).toContainText("Estimated power: 114 W")
    await expect(summary).toContainText("No compatibility issues found.")

    // Read-only: nothing to remove, change or choose
    for (const name of [/Remove/, /Change/, /Choose/, /Add build to cart/]) {
      await expect(view.getByRole("button", { name })).toHaveCount(0)
    }
  } finally {
    await visitor.close()
  }
})

test("a link that no build has is a 404 (E34, E35)", async ({ request }) => {
  for (const path of [
    "/builds/zzzzzzzzzz",
    "/builds/UPPERCASE1",
    "/builds/short",
    `/builds/${"a".repeat(200)}`,
  ]) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(404)
  }
})

test("a shared page is not indexed, has its own canonical and link preview (E37)", async ({
  page,
}) => {
  const path = await shareRyzen(page)

  await page.goto(path)
  await expect(page).toHaveTitle(/Shared PC build/)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex"
  )
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `http://localhost:3000${path}`
  )
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Shared PC build"
  )
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    `http://localhost:3000${path}`
  )
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /og-default\.png$/
  )
})
