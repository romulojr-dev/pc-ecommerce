import type { APIRequestContext, Page } from "@playwright/test"

import {
  buildAItems,
  type SavedItem,
  saveBuild,
  SAVED_BUILD,
} from "./build-fixtures"
import { expect, test } from "./test"

// Add to build on a product page that doesn't fit
// (docs/specs/024-add-anyway-product-page). Needs a seeded database. Every
// test starts with an empty saved build (a fresh browser context); Build A,
// or part of it, is saved on the page under test.

const LGA1700 = "MSI PRO B760M-A WiFi DDR4"
const FITS = "ASRock B650M-HDV/M.2"
const SOCKET_ERROR =
  "The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4."

const addToBuild = (page: Page) =>
  page.getByRole("button", { name: "Add to build", exact: true })
const status = (page: Page) => page.getByRole("status")
const fitBlock = (page: Page) =>
  page.getByRole("region", { name: "Fit with your build" })
const misfit = (page: Page) =>
  page.getByRole("dialog", { name: "Add a part that doesn't fit?" })
const replaceDialog = (page: Page, noun: string) =>
  page.getByRole("dialog", { name: `Replace the ${noun} in your build?` })

// A product page, reached from its category listing
async function openProduct(page: Page, listing: string, name: string) {
  await page.goto(listing)
  await page
    .getByRole("main")
    .getByRole("link", { name, exact: true })
    .first()
    .click()
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()
}

const savedItems = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).state.items as SavedItem[],
    SAVED_BUILD
  )

// The parts request is held until `release`, so a click can land while the
// build is loading. `answer` then lets it through, or answers 500.
async function holdPartsRequest(
  page: Page,
  answer: "continue" | "fail" = "continue"
) {
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route("**/api/builder/parts*", async (route) => {
    await held
    if (answer === "fail") {
      await route.fulfill({ status: 500, body: "{}" })
    } else {
      await route.continue()
    }
  })
  return release
}

async function buildAWith(
  request: APIRequestContext,
  change: (items: SavedItem[]) => SavedItem[] = (items) => items
) {
  return change(await buildAItems(request))
}

test("a part that doesn't fit asks once, and Cancel changes nothing (E1, E2, E17, E18)", async ({
  page,
  request,
}) => {
  const items = await buildAWith(request)
  await openProduct(page, "/motherboard", LGA1700)
  await saveBuild(page, items)
  await expect(fitBlock(page)).toContainText("Doesn't fit your build")

  await addToBuild(page).click()
  const dialog = misfit(page)
  await expect(dialog).toContainText(SOCKET_ERROR)
  await expect(dialog).toContainText(
    "is DDR5 memory, but the MSI PRO B760M-A WiFi DDR4 takes DDR4."
  )
  // The one dialog also says the board replaces the Strix
  await expect(dialog).toContainText(
    "This also replaces the motherboard you picked."
  )
  await expect(replaceDialog(page, "motherboard")).toHaveCount(0)
  await expect(dialog.locator(":focus")).toHaveCount(1)
  expect(await savedItems(page)).toEqual(items)

  // Escape cancels, and focus is back on the button
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(addToBuild(page)).toBeFocused()
  await expect(status(page)).toBeEmpty()

  await addToBuild(page).click()
  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(dialog).toBeHidden()
  await expect(addToBuild(page)).toBeFocused()
  await expect(status(page)).toBeEmpty()
  expect(await savedItems(page)).toEqual(items)
})

test("Add anyway replaces the motherboard (E3, E19)", async ({
  page,
  request,
}) => {
  const items = await buildAWith(request)
  await openProduct(page, "/motherboard", LGA1700)
  await saveBuild(page, items)
  await expect(fitBlock(page)).toContainText("Doesn't fit your build")

  await addToBuild(page).click()
  await misfit(page).getByRole("button", { name: "Add anyway" }).click()

  await expect(misfit(page)).toBeHidden()
  await expect(status(page)).toContainText("Added to your build.")
  await expect(fitBlock(page)).toContainText("In your build")
  const saved = await savedItems(page)
  expect(saved).toHaveLength(items.length)
  const before = items.find((item) => item.slot === "motherboard")!
  const after = saved.find((item) => item.slot === "motherboard")!
  expect(after.productId).not.toBe(before.productId)
  // Everything else is as it was
  expect(saved.filter((item) => item.slot !== "motherboard")).toEqual(
    items.filter((item) => item.slot !== "motherboard")
  )
})

test("an empty slot has nothing to replace, so no replace sentence (E4)", async ({
  page,
  request,
}) => {
  const items = await buildAWith(request, (all) =>
    all.filter((item) => item.slot === "cpu")
  )
  await openProduct(page, "/motherboard", LGA1700)
  await saveBuild(page, items)
  await expect(fitBlock(page)).toContainText("Doesn't fit your build")

  await addToBuild(page).click()
  await expect(misfit(page)).toContainText(SOCKET_ERROR)
  await expect(misfit(page)).not.toContainText("also replaces")
  await misfit(page).getByRole("button", { name: "Add anyway" }).click()
  await expect(status(page)).toContainText("Added to your build.")
  expect((await savedItems(page)).map((item) => item.slot)).toEqual([
    "cpu",
    "motherboard",
  ])
})

test("a memory kit that doesn't fit keeps the quantity it replaces (E5)", async ({
  page,
  request,
}) => {
  const items = await buildAWith(request, (all) =>
    all.map((item) =>
      item.slot === "memory" ? { ...item, quantity: 2 } : item
    )
  )
  await openProduct(
    page,
    "/memory",
    "Kingston FURY Beast DDR4-3200 16 GB (2×8 GB) CL16"
  )
  await saveBuild(page, items)
  await expect(fitBlock(page)).toContainText("Doesn't fit your build")

  await addToBuild(page).click()
  await expect(misfit(page)).toContainText(
    "This also replaces the memory you picked, keeping 2 kits."
  )
  await misfit(page).getByRole("button", { name: "Add anyway" }).click()
  const memory = (await savedItems(page)).find(
    (item) => item.slot === "memory"
  )!
  expect(memory.quantity).toBe(2)
  expect(memory.productId).not.toBe(
    items.find((item) => item.slot === "memory")!.productId
  )
})

test("a part that fits or has warnings only gets today's Replace dialog (E6, E7, E23)", async ({
  page,
  request,
}) => {
  const items = await buildAWith(request)

  await openProduct(page, "/motherboard", FITS)
  await saveBuild(page, items)
  await expect(fitBlock(page)).toContainText("Fits your build")
  await addToBuild(page).click()
  await expect(replaceDialog(page, "motherboard")).toBeVisible()
  await expect(misfit(page)).toHaveCount(0)
  await page.keyboard.press("Escape")

  // The saved build stays in this browser, so the next page reads it too
  await page.goto("/cpu/amd-ryzen-7-9800x3d")
  await expect(fitBlock(page)).toContainText("Fits, with warnings")
  await addToBuild(page).click()
  await expect(replaceDialog(page, "CPU")).toBeVisible()
  await expect(misfit(page)).toHaveCount(0)
})

test("a part already in the build never asks (E10)", async ({
  page,
  request,
}) => {
  const items = await buildAWith(request)
  await openProduct(page, "/motherboard", "ASUS ROG Strix B650-A Gaming WiFi")
  await saveBuild(page, items)
  await expect(fitBlock(page)).toContainText("In your build")

  await addToBuild(page).click()
  await expect(status(page)).toContainText("Already in your build.")
  await expect(misfit(page)).toHaveCount(0)
})

test("a click while the build loads waits, then asks (E20)", async ({
  page,
  request,
}) => {
  const items = await buildAWith(request)
  await openProduct(page, "/motherboard", LGA1700)
  const release = await holdPartsRequest(page)
  await saveBuild(page, items)

  const add = addToBuild(page)
  await add.click()
  await expect(add).toHaveAttribute("aria-busy", "true")
  await expect(add).toBeDisabled()
  await expect(status(page)).toContainText("Checking your build…")
  // A second click does nothing, and nothing is saved yet
  await add.click({ force: true })
  await expect(misfit(page)).toHaveCount(0)
  expect(await savedItems(page)).toEqual(items)

  release()
  await expect(misfit(page)).toContainText(SOCKET_ERROR)
  expect(await savedItems(page)).toEqual(items)

  // The page behind the modal is hidden from the tree, so check it once the
  // dialog is closed: the wait is over and the line is clear
  await page.keyboard.press("Escape")
  await expect(misfit(page)).toBeHidden()
  await expect(add).not.toHaveAttribute("aria-busy", "true")
  await expect(add).toBeEnabled()
  await expect(status(page)).toBeEmpty()
})

test("a click while the build loads waits, then adds a part that fits (E21)", async ({
  page,
  request,
}) => {
  const items = await buildAWith(request, (all) =>
    all.filter((item) => item.slot === "cpu")
  )
  await openProduct(page, "/motherboard", FITS)
  const release = await holdPartsRequest(page)
  await saveBuild(page, items)

  await addToBuild(page).click()
  await expect(status(page)).toContainText("Checking your build…")
  expect(await savedItems(page)).toEqual(items)

  release()
  await expect(status(page)).toContainText("Added to your build.")
  await expect(misfit(page)).toHaveCount(0)
  expect((await savedItems(page)).map((item) => item.slot)).toEqual([
    "cpu",
    "motherboard",
  ])
})

test("a click while the build loads adds without asking when the load fails (E22)", async ({
  page,
  request,
}) => {
  const items = await buildAWith(request, (all) =>
    all.filter((item) => item.slot === "cpu")
  )
  await openProduct(page, "/motherboard", LGA1700)
  const release = await holdPartsRequest(page, "fail")
  await saveBuild(page, items)

  await addToBuild(page).click()
  await expect(status(page)).toContainText("Checking your build…")

  release()
  await expect(status(page)).toContainText("Added to your build.")
  await expect(misfit(page)).toHaveCount(0)
  expect((await savedItems(page)).map((item) => item.slot)).toEqual([
    "cpu",
    "motherboard",
  ])
  // No hint and no error text: the check couldn't run
  await expect(fitBlock(page)).not.toContainText("build")
})

test("the block and the button share one parts request (E26)", async ({
  page,
  request,
}) => {
  const items = await buildAWith(request)
  await openProduct(page, "/motherboard", LGA1700)
  const requests: string[] = []
  page.on("request", (req) => {
    if (req.url().includes("/api/builder/parts")) requests.push(req.url())
  })
  await saveBuild(page, items)
  await expect(fitBlock(page)).toContainText("Doesn't fit your build")
  expect(requests).toHaveLength(1)
})
