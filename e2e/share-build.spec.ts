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

// Open in builder (docs/specs/022-share-build, Behavior 20–26)

const I5 = "/cpu/intel-core-i5-14400f"
const STRIX = "/motherboard/asus-rog-strix-b650-a-gaming-wifi"
const SAVED_BUILD = "pc-silicon-build"

async function addToBuild(page: Page, path: string) {
  await page.goto(path)
  await page.getByRole("button", { name: "Add to build" }).click()
  await expect(page.getByRole("status")).toContainText("Added to your build.")
}

const savedItems = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null")?.state.items,
    SAVED_BUILD
  )

const cpuRow = (page: Page, name: string) =>
  page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "CPU", exact: true }) })
    .getByRole("link", { name, exact: true })

const openInBuilder = (page: Page) =>
  page.getByRole("button", { name: "Open in builder" })

const replaceDialog = (page: Page) =>
  page.getByRole("dialog", { name: "Replace your current build?" })

test("someone with no build opens a shared one straight into their builder (E49)", async ({
  page,
  browser,
}) => {
  const path = await shareRyzen(page)

  const visitor = await asVisitor(browser, path)
  try {
    const view = visitor.page
    await openInBuilder(view).click()

    // No question to ask, and nothing to say about parts left out
    await expect(view).toHaveURL("/builder")
    await expect(cpuRow(view, "AMD Ryzen 5 7600")).toBeVisible()
    expect(await savedItems(view)).toEqual([
      expect.objectContaining({ slot: "cpu", quantity: 1 }),
    ])
    await expect(view.getByText(/shared build is no longer/)).toHaveCount(0)
  } finally {
    await visitor.close()
  }
})

test("a different saved build is replaced only after asking (E50)", async ({
  page,
  browser,
}) => {
  const path = await shareRyzen(page)

  const visitor = await asVisitor(browser, I5)
  try {
    const view = visitor.page
    await view.getByRole("button", { name: "Add to build" }).click()
    await expect(view.getByRole("status")).toContainText("Added to your build.")
    const before = await savedItems(view)

    await view.goto(path)
    await openInBuilder(view).click()
    const dialog = replaceDialog(view)
    await expect(dialog).toContainText(
      "Opening this build replaces the 1 part in your builder."
    )

    // Cancel changes nothing
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await expect(dialog).toBeHidden()
    await expect(view).toHaveURL(path)
    expect(await savedItems(view)).toEqual(before)
    await expect(openInBuilder(view)).toBeFocused()

    // Replace swaps the build and goes to the builder
    await openInBuilder(view).click()
    await replaceDialog(view).getByRole("button", { name: "Replace" }).click()
    await expect(view).toHaveURL("/builder")
    await expect(cpuRow(view, "AMD Ryzen 5 7600")).toBeVisible()
    await expect(cpuRow(view, "Intel Core i5-14400F")).toHaveCount(0)
  } finally {
    await visitor.close()
  }
})

test("opening your own shared build doesn't ask (E51)", async ({ page }) => {
  const path = await shareRyzen(page)

  await page.goto(path)
  await openInBuilder(page).click()

  await expect(page).toHaveURL("/builder")
  await expect(cpuRow(page, "AMD Ryzen 5 7600")).toBeVisible()
})

test("a build that has gained a part is asked about (E51a)", async ({
  page,
}) => {
  const path = await shareRyzen(page)
  await addToBuild(page, STRIX)

  await page.goto(path)
  await openInBuilder(page).click()

  await expect(replaceDialog(page)).toContainText(
    "Opening this build replaces the 2 parts in your builder."
  )
})

// The acceptance criterion: share Build A (spec 001's compatible build), open
// the link in a fresh browser context, Open in builder, and the build matches.
const BUILD_A = [
  { path: RYZEN, name: "AMD Ryzen 5 7600", slot: "CPU" },
  {
    path: STRIX,
    name: "ASUS ROG Strix B650-A Gaming WiFi",
    slot: "Motherboard",
  },
  {
    path: "/memory/corsair-vengeance-ddr5-6000-32-gb-2-16-gb-cl30",
    name: "Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30",
    slot: "Memory",
  },
  {
    path: "/storage/samsung-990-pro-1tb-nvme-ssd",
    name: "Samsung 990 PRO 1TB NVMe SSD",
    slot: "Storage",
  },
  {
    path: "/gpu/asus-dual-geforce-rtx-4060-oc-edition-8gb",
    name: "ASUS Dual GeForce RTX 4060 OC Edition 8GB",
    slot: "Graphics Card",
  },
  {
    path: "/case/lian-li-lancool-216-black",
    name: "Lian Li LANCOOL 216 Black",
    slot: "Case",
  },
  {
    path: "/psu/cooler-master-mwe-550-bronze-v2",
    name: "Cooler Master MWE 550 Bronze V2",
    slot: "Power Supply",
  },
  {
    path: "/cpu-cooler/thermalright-peerless-assassin-120-se",
    name: "Thermalright Peerless Assassin 120 SE",
    slot: "CPU Cooler",
  },
] as const

// The saved items in a fixed order, to compare two builds
const canonicalSaved = async (page: Page) =>
  [...(await savedItems(page))].sort(
    (
      a: { slot: string; productId: string },
      b: { slot: string; productId: string }
    ) => a.slot.localeCompare(b.slot) || a.productId.localeCompare(b.productId)
  )

async function expectBuildA(page: Page, summaryName: string) {
  for (const { name, slot } of BUILD_A) {
    const row = page.getByRole("listitem").filter({
      has: page.getByRole("heading", { name: slot, exact: true }),
    })
    await expect(row.getByRole("link", { name, exact: true })).toBeVisible()
  }
  const summary = page.getByRole("complementary", { name: summaryName })
  await expect(summary).toContainText("₱69,060.00")
  await expect(summary).toContainText("Estimated power: 264 W of 550 W (48%)")
  await expect(summary).toContainText("No compatibility issues found.")
  await expect(summary).toContainText("OK")
}

test("share Build A, open it as someone else, and the builds match", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000)
  for (const { path } of BUILD_A) await addToBuild(page, path)
  await page.goto("/builder")
  await expect(page.getByRole("button", { name: "Share build" })).toBeEnabled()
  await expectBuildA(page, "Your build")
  const sharerItems = await canonicalSaved(page)
  expect(sharerItems).toHaveLength(8)

  await page.getByRole("button", { name: "Share build" }).click()
  const field = shareDialog(page).getByRole("textbox", { name: "Share link" })
  await expect(field).toHaveValue(LINK)
  const path = new URL(await field.inputValue()).pathname

  const visitor = await asVisitor(browser, path)
  try {
    const view = visitor.page
    await expectBuildA(view, "Summary")
    await expect(view.getByText("no longer sold")).toHaveCount(0)

    await openInBuilder(view).click()
    await expect(view).toHaveURL("/builder")
    await expectBuildA(view, "Your build")
    expect(await canonicalSaved(view)).toEqual(sharerItems)
    await expect(view.getByText(/shared build is no longer/)).toHaveCount(0)
  } finally {
    await visitor.close()
  }
})
