import type { Page } from "@playwright/test"

import { authFile } from "./accounts"
import {
  CASH,
  createAdminOrders,
  ONLINE,
  RAW_VALUES,
  removeAdminOrders,
} from "./admin-order-fixtures"
import { expect, test } from "./test"

// docs/specs/041-admin-orders-list-detail, T-E2E: staff find an order and see
// all of it; Demo sees masks, cannot search by customer, and is sent no raw
// value, not even in the RSC payload. The orders are inserted by
// e2e/admin-order-fixtures.ts with names nobody else uses, and removed after.
// The file runs on one worker: the fixtures are shared.

test.describe.configure({ mode: "serial" })

test.beforeAll(createAdminOrders)
test.afterAll(removeAdminOrders)

const row = (page: Page, number: string) =>
  page.getByRole("row").filter({ hasText: number })

// The text Playwright's request context gets from a page, asking for the RSC
// payload the way Next's client does
async function rscPayload(page: Page, path: string): Promise<string> {
  const response = await page.request.get(path, {
    headers: { RSC: "1", Accept: "text/x-component" },
  })
  expect(response.status(), path).toBe(200)
  return response.text()
}

function expectNoRaw(text: string, path: string) {
  const lower = text.toLowerCase()
  for (const value of RAW_VALUES) {
    for (const form of [
      value,
      JSON.stringify(value).slice(1, -1),
      encodeURIComponent(value),
    ]) {
      expect(
        lower.includes(form.toLowerCase()),
        `${path} holds "${form}"`
      ).toBe(false)
    }
  }
}

test.describe("owner", () => {
  test.use({ storageState: authFile("owner") })

  test("filters by number, status and payment, and keeps them in the URL", async ({
    page,
  }) => {
    await page.goto("/admin/orders")
    await page.getByLabel("Order number").fill("e2ea")
    await page.getByRole("button", { name: "Search" }).click()
    await expect(page).toHaveURL(/number=e2ea/)
    await expect(row(page, ONLINE.number)).toBeVisible()
    await expect(row(page, CASH.number)).toHaveCount(0)

    await page.goto("/admin/orders?number=PCS-E2E&payment=cod")
    await expect(row(page, CASH.number)).toBeVisible()
    await expect(row(page, ONLINE.number)).toHaveCount(0)

    await page.goto("/admin/orders?number=PCS-E2E")
    await page.getByLabel("Status").selectOption({ label: "COD confirmed" })
    await page.getByRole("button", { name: "Search" }).click()
    await expect(page).toHaveURL(/status=COD_CONFIRMED/)
    await expect(row(page, CASH.number)).toBeVisible()
    await expect(row(page, ONLINE.number)).toHaveCount(0)

    await page.getByRole("link", { name: "Clear filters" }).click()
    await expect(page).toHaveURL(/\/admin\/orders$/)
  })

  test("invalid values fall back to the defaults", async ({ page }) => {
    await page.goto("/admin/orders?status=bogus&payment=card&page=abc")
    await expect(page).toHaveURL(/\/admin\/orders$/)
    await expect(
      page.getByRole("heading", { name: "Orders", level: 1 })
    ).toBeVisible()
  })

  test("no match says so, without a redirect", async ({ page }) => {
    await page.goto("/admin/orders?number=ZZZZZZZZ&page=4")
    await expect(page).toHaveURL(/page=4/)
    await expect(page.getByText("No orders match these filters.")).toBeVisible()
  })

  test("searches by customer name, email and every spelling of the mobile", async ({
    page,
  }) => {
    for (const term of [
      "quintana",
      "ZELDA.QUINTANA@example",
      "0917 555 0123",
      "+63 917 555 0123",
      "9175550123",
    ]) {
      await page.goto(`/admin/orders?customer=${encodeURIComponent(term)}`)
      await expect(row(page, ONLINE.number), term).toBeVisible()
      await expect(row(page, CASH.number), term).toHaveCount(0)
    }
    await page.goto("/admin/orders?customer=zz")
    await expect(
      page.getByText("Type at least 3 characters to search customers.")
    ).toBeVisible()
  })

  test("opens an order and shows all of it", async ({ page }) => {
    await page.goto("/admin/orders?number=e2ea")
    await row(page, ONLINE.number)
      .getByRole("link", { name: ONLINE.number })
      .click()
    await expect(page).toHaveURL(new RegExp(`/admin/orders/${ONLINE.number}`))
    await expect(
      page.getByRole("heading", { name: ONLINE.number, level: 1 })
    ).toBeVisible()
    for (const text of [
      ONLINE.name,
      ONLINE.email,
      ONLINE.mobile,
      ONLINE.street,
      "Pending payment",
      "No payment attempts.",
      "No emails for this order.",
    ]) {
      await expect(page.getByText(text).first()).toBeVisible()
    }
    // Back returns to the list as it was left
    await page.getByRole("link", { name: "Back to orders" }).click()
    await expect(page).toHaveURL(/number=e2ea/)
  })

  test("a cash order shows the amount to collect", async ({ page }) => {
    await page.goto(`/admin/orders/${CASH.number}`)
    await expect(
      page.getByText("Amount to collect ₱23,110.00 on delivery")
    ).toBeVisible()
    await expect(
      page.getByText("Cash on delivery, no online payment")
    ).toBeVisible()
  })

  test("the packing slip has the mobile, no prices and a warning", async ({
    page,
  }) => {
    await page.goto(`/admin/orders/${ONLINE.number}`)
    await page.getByRole("link", { name: "Packing slip" }).click()
    await expect(page).toHaveURL(/packing-slip$/)
    await expect(page.getByText(ONLINE.mobile)).toBeVisible()
    await expect(page.getByText(ONLINE.street, { exact: false })).toBeVisible()
    await expect(
      page.getByText("Do not ship: this order is Pending payment.")
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Print" })).toBeVisible()
    expect(await page.locator("article").innerText()).not.toContain("₱")

    // On paper: the buttons and the sidebar are gone
    await page.emulateMedia({ media: "print" })
    await expect(page.getByRole("button", { name: "Print" })).toBeHidden()
    await expect(page.locator('[data-slot="sidebar"]')).toBeHidden()
    await expect(page.getByTestId("admin-person")).toBeHidden()
  })

  test("control: the RSC payload does carry the customer for Owner", async ({
    page,
  }) => {
    await page.goto(`/admin/orders/${ONLINE.number}`)
    const payload = await rscPayload(page, `/admin/orders/${ONLINE.number}`)
    expect(payload).toContain(ONLINE.name)
    expect(payload).toContain(ONLINE.mobile)
  })

  test("unknown and malformed numbers are 404s", async ({ page }) => {
    for (const path of [
      "/admin/orders/PCS-AAAAAAAA",
      "/admin/orders/not-an-order",
      "/admin/orders/PCS-AAAAAAAA/packing-slip",
    ]) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(404)
    }
  })
})

test.describe("staff", () => {
  test.use({ storageState: authFile("staff") })

  test("can search by customer and open the slip", async ({ page }) => {
    await page.goto("/admin/orders?customer=villanueva")
    await expect(row(page, CASH.number)).toBeVisible()
    await page.goto(`/admin/orders/${CASH.number}/packing-slip`)
    await expect(page.getByText(CASH.mobile)).toBeVisible()
    await expect(page.getByText("Collect payment")).toBeVisible()
  })
})

test.describe("demo", () => {
  test.use({ storageState: authFile("demo") })

  test("sees masks and cannot search by customer", async ({ page }) => {
    await page.goto("/admin/orders?number=PCS-E2E")
    await expect(row(page, ONLINE.number)).toContainText("Z••• Q•••")
    await expect(row(page, CASH.number)).toContainText("Y••• V•••")
    await expect(page.getByLabel("Customer")).toBeDisabled()
    await expect(page.getByLabel("Customer")).toHaveAttribute(
      "placeholder",
      "This account is read-only"
    )

    await page.goto("/admin/orders?customer=quintana")
    await expect(
      page.getByText("This account is read-only").first()
    ).toBeVisible()
    await expect(row(page, ONLINE.number)).toHaveCount(0)
  })

  test("the detail and the slip are masked", async ({ page }) => {
    await page.goto(`/admin/orders/${ONLINE.number}`)
    await expect(page.getByText("Z••• Q•••").first()).toBeVisible()
    await expect(page.getByText("+63•••••••••").first()).toBeVisible()
    await expect(
      page.getByText("National Capital Region (NCR)").first()
    ).toBeVisible()
    await page.goto(`/admin/orders/${ONLINE.number}/packing-slip`)
    await expect(page.getByText("+63•••••••••")).toBeVisible()
  })

  test("no raw value in the HTML or the RSC payload of the three pages", async ({
    page,
  }) => {
    for (const path of [
      "/admin/orders?number=PCS-E2E",
      `/admin/orders/${ONLINE.number}`,
      `/admin/orders/${CASH.number}/packing-slip`,
    ]) {
      await page.goto(path)
      expectNoRaw(await page.content(), `${path} (HTML)`)
      expectNoRaw(await rscPayload(page, path), `${path} (RSC)`)
    }
  })
})
