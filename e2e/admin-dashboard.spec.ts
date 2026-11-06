import type { Page } from "@playwright/test"

import { authFile } from "./accounts"
import {
  createDashboardOrder,
  PAID,
  RAW_VALUES,
  removeDashboardOrder,
} from "./admin-dashboard-fixtures"
import { expect, test } from "./test"

// docs/specs/048-admin-dashboard, T-E2E: the owner lands on the dashboard and
// sees a new paid order in today's figures and in the recent orders; Staff has
// no Dashboard item and no access; Demo sees the real figures with the name
// masked, also in the RSC payload. "Today" moves, so the figures are read
// before and after inserting one known paid order. One worker: the tests share
// the order.

test.describe.configure({ mode: "serial" })

test.afterAll(removeDashboardOrder)

// "₱1,234.50" -> 123450
const centavos = (text: string) =>
  Number(text.replace(/[^\d.]/g, "").replace(".", ""))

async function todayPaidSales(page: Page): Promise<number> {
  const figure = page
    .locator('section[aria-labelledby="dashboard-today"] dd')
    .first()
  return centavos(await figure.innerText())
}

test.describe("owner", () => {
  test.use({ storageState: authFile("owner") })

  test("lands on the dashboard, first in the nav, and sees a new paid order", async ({
    page,
  }) => {
    await removeDashboardOrder()
    await page.goto("/admin")
    await expect(page).toHaveURL(/\/admin\/dashboard$/, { timeout: 20_000 })
    await expect(
      page.getByRole("heading", { level: 1, name: "Dashboard" })
    ).toBeVisible()
    // Dashboard is the first item of the nav
    const nav = page.locator('[data-slot="sidebar"] a')
    await expect(nav.first()).toHaveText("Dashboard")
    const before = await todayPaidSales(page)

    await createDashboardOrder()
    await page.reload()
    expect(await todayPaidSales(page)).toBe(before + PAID.total)

    const recent = page.getByRole("region", { name: "Recent orders" })
    const row = recent.getByRole("row", { name: new RegExp(PAID.number) })
    await expect(row).toContainText(PAID.name)
    await expect(row).toContainText("₱7,777.00")
    await row.getByRole("link", { name: PAID.number }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/orders/${PAID.number}`), {
      timeout: 20_000,
    })
  })

  test("names the labels and the refund note", async ({ page }) => {
    await page.goto("/admin/dashboard")
    await expect(page.getByText("Paid sales").first()).toBeVisible()
    await expect(page.getByText("Orders placed").first()).toBeVisible()
    await expect(page.getByText("Average order value").first()).toBeVisible()
    await expect(
      page.getByText(
        "A refund recorded later lowers the figure for the day the order was paid."
      )
    ).toBeVisible()
    await expect(page.getByText("Needs review")).toBeVisible()
  })
})

test.describe("staff", () => {
  test.use({ storageState: authFile("staff") })

  test("has no Dashboard item and no access to the page", async ({ page }) => {
    await page.goto("/admin/orders")
    await expect(
      page.getByRole("link", { name: "Dashboard", exact: true })
    ).toHaveCount(0)
    await page.goto("/admin/dashboard")
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" })
    ).toBeVisible()
    await expect(page.getByText("Paid sales")).toHaveCount(0)
    // /admin sends Staff to the orders
    await page.goto("/admin")
    await expect(page).toHaveURL(/\/admin\/orders$/, { timeout: 20_000 })
  })
})

test.describe("demo", () => {
  test.use({ storageState: authFile("demo") })

  test("sees the figures with the customer masked", async ({ page }) => {
    await createDashboardOrder()
    await page.goto("/admin")
    await expect(page).toHaveURL(/\/admin\/dashboard$/, { timeout: 20_000 })
    await expect(
      page.getByText("Customer details are hidden in the demo.").first()
    ).toBeVisible()
    const row = page.getByRole("row", { name: new RegExp(PAID.number) })
    await expect(row).toContainText("₱7,777.00")
    await expect(row).not.toContainText(PAID.name)
    await expect(row).toContainText("•")
  })

  test("is sent no raw value, not even in the RSC payload", async ({
    page,
  }) => {
    const path = "/admin/dashboard"
    const html = await (await page.request.get(path)).text()
    const rsc = await (
      await page.request.get(path, {
        headers: { RSC: "1", Accept: "text/x-component" },
      })
    ).text()
    for (const value of RAW_VALUES) {
      expect(html.toLowerCase()).not.toContain(value.toLowerCase())
      expect(rsc.toLowerCase()).not.toContain(value.toLowerCase())
    }
    expect(rsc).toContain(PAID.number)
  })
})
