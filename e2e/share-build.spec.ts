import type { Page } from "@playwright/test"

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
