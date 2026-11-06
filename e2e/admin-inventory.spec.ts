import type { Page } from "@playwright/test"

import { authFile } from "./accounts"
import {
  ALPHA,
  BETA,
  GAMMA,
  insertInventoryFixtures,
  movementCount,
  NOTE,
  readFixture,
  removeInventoryFixtures,
  setFixtureStock,
  SKU_PREFIX,
} from "./admin-inventory-fixtures"
import { expect, test } from "./test"

// docs/specs/046-admin-inventory-adjustments, T-E2E: staff find stock by
// level, record a delivery through the review and confirm step, are told the
// real stock when a removal can't happen, set the low-stock threshold, and
// Demo sees everything read-only with the staff note hidden, also in the RSC
// payload. The products are throwaway (SKU prefix) and removed before and
// after. One worker: they share the fixtures.

test.describe.configure({ mode: "serial" })

test.beforeAll(insertInventoryFixtures)
test.afterAll(removeInventoryFixtures)

const list = `/admin/inventory?q=${SKU_PREFIX}`

async function open(page: Page, name: string) {
  await page.goto(list)
  await page.getByRole("link", { name }).click()
  // The first visit to a route compiles it in the dev server, which is slow
  // when other specs run at the same time
  await expect(page).toHaveURL(/\/admin\/inventory\/[^/?]+$/, {
    timeout: 20_000,
  })
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name)
}

async function fill(
  page: Page,
  reason: "Received" | "Damaged" | "Correction",
  quantity: string,
  extra: { direction?: "Add" | "Remove"; note?: string } = {}
) {
  await page.getByLabel("Reason").selectOption({ label: reason })
  await page.getByLabel("Quantity").fill(quantity)
  if (extra.direction) {
    await page.getByRole("radio", { name: extra.direction }).check()
  }
  if (extra.note !== undefined) await page.getByLabel(/^Note/).fill(extra.note)
}

test.describe("staff", () => {
  test.use({ storageState: authFile("staff") })

  test("finds stock by level and has Inventory but no Products", async ({
    page,
  }) => {
    await page.goto(list)
    await expect(
      page.getByRole("link", { name: "Inventory", exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Products", exact: true })
    ).toHaveCount(0)

    // Lowest stock first
    const names = await page.getByRole("row").allInnerTexts()
    const order = [GAMMA, BETA, ALPHA].map((f) =>
      names.findIndex((text) => text.includes(f.name))
    )
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(order.every((index) => index > 0)).toBe(true)

    await page.goto(`${list}&level=out`)
    await expect(page.getByRole("link", { name: GAMMA.name })).toBeVisible()
    await expect(page.getByRole("link", { name: BETA.name })).toHaveCount(0)

    await page.goto(`${list}&level=low`)
    await expect(page.getByRole("link", { name: BETA.name })).toBeVisible()
    await expect(page.getByRole("link", { name: ALPHA.name })).toHaveCount(0)
    await expect(page.getByRole("link", { name: GAMMA.name })).toHaveCount(0)

    await page.goto(`${list}&level=restock`)
    await expect(page.getByRole("link", { name: BETA.name })).toBeVisible()
    await expect(page.getByRole("link", { name: GAMMA.name })).toBeVisible()
  })

  test("reviews, goes back, confirms, and the history shows it", async ({
    page,
  }) => {
    await open(page, ALPHA.name)
    await fill(page, "Received", "100")
    await expect(page.getByText("Stock would be 112.")).toBeVisible()
    await page.getByRole("button", { name: "Review adjustment" }).click()

    // Nothing is written until Confirm
    await expect(page.getByText("Stock 12 → 112. Received +100.")).toBeVisible()
    expect((await readFixture(ALPHA.sku))?.stock).toBe(12)

    await page.getByRole("button", { name: "Back" }).click()
    await expect(page.getByLabel("Quantity")).toHaveValue("100")
    await page.getByRole("button", { name: "Review adjustment" }).click()
    await page.getByRole("button", { name: "Confirm" }).click()

    await expect(page.getByText("Stock is now 112.")).toBeVisible()
    await expect(page.getByTestId("current-stock")).toHaveText("112")
    expect((await readFixture(ALPHA.sku))?.stock).toBe(112)
    const row = page.getByRole("row", { name: /Received/ })
    await expect(row).toContainText("+100")
    await expect(row).toContainText("E2E Staff")
    await expect(
      page.getByText(/Changes before .* aren't recorded\./)
    ).toBeVisible()
  })

  test("won't confirm a removal below zero, and the server says what is left", async ({
    page,
  }) => {
    await open(page, BETA.name)
    await fill(page, "Damaged", "5")
    await page.getByRole("button", { name: "Review adjustment" }).click()
    await expect(page.getByText("This would take stock below 0.")).toBeVisible()
    await expect(page.getByRole("button", { name: "Confirm" })).toHaveCount(0)
    await page.getByRole("button", { name: "Back" }).click()

    // An order takes stock behind the page's back: 3 → 1
    await fill(page, "Damaged", "2")
    await page.getByRole("button", { name: "Review adjustment" }).click()
    await expect(page.getByText("Stock 3 → 1. Damaged −2.")).toBeVisible()
    await setFixtureStock(BETA.sku, 1)
    await page.getByRole("button", { name: "Confirm" }).click()

    await expect(
      page.getByText("Can't remove 2: only 1 in stock.")
    ).toBeVisible()
    await expect(page.getByTestId("current-stock")).toHaveText("1")
    expect((await readFixture(BETA.sku))?.stock).toBe(1)
    expect(await movementCount(BETA.sku)).toBe(0)
  })

  test("a correction needs a note", async ({ page }) => {
    await open(page, ALPHA.name)
    const before = await movementCount(ALPHA.sku)
    await fill(page, "Correction", "1", { direction: "Add" })
    await page.getByRole("button", { name: "Review adjustment" }).click()
    await expect(page.getByRole("alert").first()).toContainText(
      "Add a note explaining the correction."
    )
    expect(await movementCount(ALPHA.sku)).toBe(before)

    await page.getByLabel(/^Note/).fill("Recount after the delivery")
    await page.getByRole("button", { name: "Review adjustment" }).click()
    await page.getByRole("button", { name: "Confirm" }).click()
    await expect(page.getByText("Stock is now 113.")).toBeVisible()
    await expect(page.getByText("Recount after the delivery")).toBeVisible()
  })

  test("sets the low-stock threshold", async ({ page }) => {
    await open(page, ALPHA.name)
    await page.getByLabel("Low-stock at").fill("5000")
    await page.getByRole("button", { name: "Save threshold" }).click()
    await expect(
      page.getByText("Enter a whole number from 0 to 1000.")
    ).toBeVisible()

    await page.getByLabel("Low-stock at").fill("150")
    await page.getByRole("button", { name: "Save threshold" }).click()
    await expect(page.getByText("Low-stock threshold saved.")).toBeVisible()
    expect((await readFixture(ALPHA.sku))?.lowStockAt).toBe(150)

    await page.goto(`${list}&level=low`)
    await expect(page.getByRole("link", { name: ALPHA.name })).toBeVisible()
  })

  test("an unknown product is a 404", async ({ page }) => {
    const response = await page.goto("/admin/inventory/no-such-product")
    expect(response?.status()).toBe(404)
  })
})

test.describe("owner", () => {
  test.use({ storageState: authFile("owner") })

  test("can adjust and is offered the product edit screen", async ({
    page,
  }) => {
    await open(page, ALPHA.name)
    await expect(
      page.getByRole("button", { name: "Review adjustment" })
    ).toBeVisible()
    await expect(page.getByRole("link", { name: "Edit product" })).toBeVisible()
    await expect(page.getByText(NOTE)).toBeVisible()
  })
})

test.describe("demo", () => {
  test.use({ storageState: authFile("demo") })

  test("sees the stock read-only, with the staff note hidden", async ({
    page,
  }) => {
    await open(page, ALPHA.name)
    await expect(
      page.getByText("This account is read-only.").first()
    ).toBeVisible()
    await expect(page.getByLabel("Quantity")).toBeDisabled()
    await expect(page.getByLabel("Reason")).toBeDisabled()
    await expect(
      page.getByRole("button", { name: "Review adjustment" })
    ).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Save threshold" })
    ).toHaveCount(0)
    await expect(page.getByText("Hidden in demo").first()).toBeVisible()
    await expect(page.getByText(NOTE)).toHaveCount(0)
  })

  test("is sent the note nowhere, not even in the RSC payload", async ({
    page,
  }) => {
    await open(page, ALPHA.name)
    const path = new URL(page.url()).pathname
    const html = await (await page.request.get(path)).text()
    const rsc = await (
      await page.request.get(path, {
        headers: { RSC: "1", Accept: "text/x-component" },
      })
    ).text()
    expect(html).not.toContain(NOTE)
    expect(rsc).not.toContain(NOTE)
    expect(rsc).toContain("Hidden in demo")
  })
})
