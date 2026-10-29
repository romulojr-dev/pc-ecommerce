import type { APIRequestContext, Page } from "@playwright/test"

import { buildAItems, saveBuild, SAVED_BUILD } from "./build-fixtures"
import { expect, test } from "./test"

// "Fits your build" hints (docs/specs/023-fits-your-build-hints). Needs a
// seeded database. Every test starts with an empty saved build (a fresh
// browser context); Build A is saved on the page under test. The cards are
// found by their names, and the specs never count how many boards fit: the
// seed grows (E22).

const STRIX = "ASUS ROG Strix B650-A Gaming WiFi"
const FITS = "ASRock B650M-HDV/M.2"
const LGA1700 = "MSI PRO B760M-A WiFi DDR4"

const card = (page: Page, name: string) =>
  page
    .getByRole("main")
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) })

const fitBlock = (page: Page) =>
  page.getByRole("region", { name: "Fit with your build" })

async function openWithBuildA(
  page: Page,
  request: APIRequestContext,
  path: string
) {
  await page.goto(path)
  await saveBuild(page, await buildAItems(request))
}

test("Build A on /motherboard: an AM5 board fits, an LGA1700 one doesn't, the Strix is in the build (E22)", async ({
  page,
  request,
}) => {
  await openWithBuildA(page, request, "/motherboard")

  await expect(card(page, FITS)).toContainText("Fits your build")
  await expect(card(page, LGA1700)).toContainText("Doesn't fit your build")
  await expect(card(page, STRIX)).toContainText("In your build")
})

test("a card announces its state with its product, outside the link (E23, E23a)", async ({
  page,
  request,
}) => {
  await openWithBuildA(page, request, "/motherboard")
  const board = card(page, LGA1700)
  await expect(board).toContainText("Doesn't fit your build")

  // The link's name is still the product's alone, and the state isn't in it
  await expect(
    board.getByRole("link", { name: LGA1700, exact: true })
  ).toHaveCount(1)
  await expect(
    board.getByRole("link").getByText("Doesn't fit your build")
  ).toHaveCount(0)

  // The reasons are list items in the card's accessibility tree, errors first
  const reasons = board.getByRole("listitem")
  await expect(reasons.first()).toContainText(
    "Error: The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4."
  )

  // Text, not color or an image alone
  await expect(board.getByText("Doesn't fit your build")).toBeVisible()
  await expect(card(page, FITS).getByRole("listitem")).toHaveCount(0)
})

test("a card is the same size before and after its hint shows (E24)", async ({
  page,
  request,
}) => {
  await page.goto("/motherboard")
  const before = await card(page, LGA1700).boundingBox()
  expect(before).not.toBeNull()

  await saveBuild(page, await buildAItems(request))
  await expect(card(page, LGA1700)).toContainText("Doesn't fit your build")
  const after = await card(page, LGA1700).boundingBox()
  expect(after!.height).toBeCloseTo(before!.height, 0)
})

test("one parts request serves every card, and an empty build makes none (E25, E26)", async ({
  page,
  request,
}) => {
  const partsRequests: string[] = []
  page.on("request", (req) => {
    if (req.url().includes("/api/builder/parts")) partsRequests.push(req.url())
  })

  await page.goto("/motherboard")
  await page.waitForLoadState("networkidle")
  expect(partsRequests).toHaveLength(0)
  await expect(page.getByText(/Fits your build|Doesn't fit/)).toHaveCount(0)

  const items = await buildAItems(request)
  await saveBuild(page, items)
  await expect(card(page, FITS)).toContainText("Fits your build")
  await page.waitForLoadState("networkidle")
  expect(partsRequests).toHaveLength(1)
  const ids = new URL(partsRequests[0]).searchParams.get("ids")!.split(",")
  expect(ids.sort()).toEqual(items.map((item) => item.productId).sort())
})

test("product pages show the state, and the reasons for a part that doesn't fit (E27–E29)", async ({
  page,
  request,
}) => {
  await openWithBuildA(page, request, "/motherboard")
  await expect(card(page, LGA1700)).toContainText("Doesn't fit your build")

  await card(page, LGA1700).getByRole("link", { name: LGA1700 }).click()
  await expect(fitBlock(page)).toContainText("Doesn't fit your build")
  await expect(fitBlock(page).getByText("Error:")).toHaveCount(2)
  await expect(fitBlock(page)).toContainText(
    "doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4."
  )

  await page.goto("/cpu/amd-ryzen-7-9800x3d")
  await expect(fitBlock(page)).toContainText("Fits, with warnings")
  await expect(fitBlock(page).getByText("Warning:")).toHaveCount(1)
  await expect(fitBlock(page)).toContainText("may need a BIOS update")

  await page.goto("/motherboard")
  await card(page, FITS).getByRole("link", { name: FITS }).click()
  await expect(fitBlock(page)).toContainText("Fits your build")
  await expect(fitBlock(page).getByRole("listitem")).toHaveCount(0)

  await page.goto("/cpu/amd-ryzen-5-7600")
  await expect(fitBlock(page)).toContainText("In your build")
})

test("the product page's controls don't move when the state arrives (E27)", async ({
  page,
  request,
}) => {
  await page.goto("/motherboard")
  await page.getByRole("link", { name: LGA1700, exact: true }).click()
  const add = page.getByRole("button", { name: "Add to build" })
  await expect(add).toBeVisible()
  const price = page
    .getByRole("main")
    .getByText(/^₱[\d,]+\.\d{2}$/)
    .first()
  // Positions on the page, so a scroll reset on reload doesn't count
  const tops = async () =>
    Promise.all(
      [add, price].map((locator) =>
        locator.evaluate((el) => el.getBoundingClientRect().top + scrollY)
      )
    )
  const before = await tops()

  await saveBuild(page, await buildAItems(request))
  await expect(fitBlock(page)).toContainText("Doesn't fit your build")
  expect(await tops()).toEqual(before)
})

test("adding the only part to an empty build reads 'In your build' (E30)", async ({
  page,
}) => {
  await page.goto("/cpu/amd-ryzen-5-7600")
  await expect(fitBlock(page)).toBeAttached()
  await expect(fitBlock(page)).not.toContainText("build")

  await page.getByRole("button", { name: "Add to build" }).click()
  await expect(fitBlock(page)).toContainText("In your build")
})

test("search results use each product's own slot (E31)", async ({
  page,
  request,
}) => {
  await openWithBuildA(page, request, "/search?q=ryzen+5")

  await expect(card(page, "AMD Ryzen 5 7600")).toContainText("In your build")
  await expect(card(page, "AMD Ryzen 5 7600X")).toContainText("Fits your build")
  await expect(card(page, "AMD Ryzen 5 5600")).toContainText(
    "Doesn't fit your build"
  )
})

test("similar products and the home page have no hint (E32)", async ({
  page,
  request,
}) => {
  await openWithBuildA(page, request, "/cpu/amd-ryzen-5-7600")
  await expect(fitBlock(page)).toContainText("In your build")
  const similar = page.getByRole("region", { name: "Similar products" })
  await expect(similar).toBeVisible()
  await expect(similar).not.toContainText(/Fits your build|Doesn't fit/)

  await page.goto("/")
  await page.waitForLoadState("networkidle")
  await expect(page.getByRole("main")).not.toContainText(
    /Fits your build|Doesn't fit your build|In your build/
  )
})

test("a failed parts request shows no hint and leaves the build alone (E33)", async ({
  page,
  request,
}) => {
  await page.route("**/api/builder/parts*", (route) =>
    route.fulfill({ status: 500, body: "{}" })
  )
  await page.goto("/motherboard")
  const items = await buildAItems(request)
  await saveBuild(page, items)
  await page.waitForLoadState("networkidle")

  await expect(card(page, FITS)).toBeVisible()
  await expect(page.getByText(/Fits your build|Doesn't fit/)).toHaveCount(0)
  await expect(page.getByText(/couldn't load/i)).toHaveCount(0)
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).state.items,
    SAVED_BUILD
  )
  expect(saved).toEqual(items)
})

test("another tab's change to the build updates the hints with no reload (E35)", async ({
  context,
  page,
}) => {
  await page.goto("/motherboard")
  await expect(card(page, LGA1700)).toBeVisible()
  await expect(page.getByText(/Fits your build|Doesn't fit/)).toHaveCount(0)

  // A second tab adds the Ryzen 5 7600
  const other = await context.newPage()
  await other.goto("/cpu/amd-ryzen-5-7600")
  await other.getByRole("button", { name: "Add to build" }).click()
  await expect(other.getByRole("status")).toContainText("Added to your build.")

  await expect(card(page, FITS)).toContainText("Fits your build")
  await expect(card(page, LGA1700)).toContainText("Doesn't fit your build")

  // ...and then clears the build
  await other.evaluate((key) => localStorage.removeItem(key), SAVED_BUILD)
  await expect(page.getByText(/Fits your build|Doesn't fit/)).toHaveCount(0)
})
