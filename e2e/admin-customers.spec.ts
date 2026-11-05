import type { Page } from "@playwright/test"

import { authFile } from "./accounts"
import {
  createCustomerOrders,
  RAW_VALUES,
  removeCustomerOrders,
  WANDA,
  WANDA_SPENT,
  XAVIER,
} from "./admin-customer-fixtures"
import { expect, test } from "./test"

// docs/specs/042-admin-customers, T-E2E: staff see who bought and follow a
// customer into their orders; Demo sees masks, cannot search, and is sent no
// raw value, not even in the RSC payload. The orders are inserted by
// e2e/admin-customer-fixtures.ts with names nobody else uses, and removed
// after. The file runs on one worker: the fixtures are shared.

test.describe.configure({ mode: "serial" })

test.beforeAll(createCustomerOrders)
test.afterAll(removeCustomerOrders)

const row = (page: Page, text: string) =>
  page.getByRole("row").filter({ hasText: text })

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

  test("lists a customer once with the counted total, and follows them to their orders", async ({
    page,
  }) => {
    await page.goto("/admin/customers?customer=marasigan")
    const wanda = row(page, WANDA.name)
    await expect(wanda).toHaveCount(1)
    // Two orders under two spellings of one address; only the Paid one counts
    await expect(wanda.getByRole("cell").nth(1)).toHaveText("2")
    await expect(wanda).toContainText(WANDA_SPENT)

    await wanda.getByRole("link", { name: "View orders" }).click()
    await expect(page).toHaveURL(/\/admin\/orders\?buyer=/)
    await expect(page.getByText(`Orders from ${WANDA.name}`)).toBeVisible()
    await expect(row(page, WANDA.paidNumber)).toBeVisible()
    await expect(row(page, WANDA.pendingNumber)).toBeVisible()
    await expect(row(page, XAVIER.number)).toHaveCount(0)

    await page.getByRole("link", { name: "Show all customers' orders" }).click()
    await expect(page).toHaveURL(/\/admin\/orders$/)
    // Other specs place orders at the same time, so a fixture order may be on
    // a later page: the filter is gone, and Xavier's order is there by number
    await expect(page.getByText(/^Orders from /)).toHaveCount(0)
    await page.goto(`/admin/orders?number=${XAVIER.number}`)
    await expect(row(page, XAVIER.number)).toBeVisible()
  })

  test("searches by name, email and a mobile spelling", async ({ page }) => {
    await page.goto("/admin/customers")
    await page.getByLabel("Name, email or mobile").fill("dimaculangan")
    await page.getByRole("button", { name: "Search" }).click()
    await expect(page).toHaveURL(/customer=dimaculangan/)
    await expect(row(page, XAVIER.name)).toHaveCount(1)
    await expect(row(page, WANDA.name)).toHaveCount(0)

    await page.goto("/admin/customers?customer=0917%20555%200311")
    await expect(row(page, WANDA.name)).toHaveCount(1)

    await page.goto("/admin/customers?customer=zzzzzzzz")
    await expect(
      page.getByText("No customers match this search.")
    ).toBeVisible()
    await page.getByRole("link", { name: "Clear search" }).first().click()
    await expect(page).toHaveURL(/\/admin\/customers$/)
  })

  test("an order's page links to its customer", async ({ page }) => {
    await page.goto(`/admin/orders/${XAVIER.number}`)
    await page
      .getByRole("link", { name: "View this customer's orders" })
      .click()
    await expect(page.getByText(`Orders from ${XAVIER.name}`)).toBeVisible()
    await expect(row(page, XAVIER.number)).toBeVisible()
  })
})

// Demo can't search, and other specs add customers at the same time, so walk
// the pages until the masked fixture customer shows
async function openMaskedWanda(page: Page) {
  await page.goto("/admin/customers")
  const wanda = row(page, "W••• M•••")
  const next = page.getByRole("link", { name: "Next" })
  for (let i = 0; i < 40 && (await wanda.count()) === 0; i++) {
    if ((await next.count()) === 0) break
    await next.click()
    await page.waitForLoadState("networkidle")
  }
  await expect(wanda).toHaveCount(1)
  return wanda
}

test.describe("demo", () => {
  test.use({ storageState: authFile("demo") })

  test("sees masked rows, a disabled search and the read-only answer", async ({
    page,
  }) => {
    await page.goto("/admin/customers")
    await expect(page.getByLabel("Name, email or mobile")).toBeDisabled()
    await expect(page.getByText(/^[A-Z]••• /).first()).toBeVisible()
    await expect(page.getByText(WANDA.name)).toHaveCount(0)

    await page.goto("/admin/customers?customer=marasigan")
    await expect(
      page.getByText("This account is read-only").first()
    ).toBeVisible()
    await expect(page.getByText("W••• M•••")).toHaveCount(0)
  })

  test("follows a masked row to that customer's orders", async ({ page }) => {
    const wanda = await openMaskedWanda(page)
    await wanda.getByRole("link", { name: "View orders" }).click()
    await expect(page).toHaveURL(/buyer=c\d+$/)
    await expect(page.getByText("Orders from W••• M•••")).toBeVisible()
    await expect(row(page, WANDA.paidNumber)).toBeVisible()
    await expect(row(page, XAVIER.number)).toHaveCount(0)
  })

  test("is sent no raw value, not even in the RSC payload", async ({
    page,
  }) => {
    const wanda = await openMaskedWanda(page)
    const href = await wanda
      .getByRole("link", { name: "View orders" })
      .getAttribute("href")
    expect(href).toMatch(/^\/admin\/orders\?buyer=c\d+$/)

    const paths = [
      "/admin/customers",
      href!,
      `/admin/orders/${WANDA.paidNumber}`,
    ]
    for (const path of paths) {
      const html = await (await page.request.get(path)).text()
      expectNoRaw(html, path)
      expectNoRaw(await rscPayload(page, path), `${path} (RSC)`)
    }
    // An email as the buyer names nobody
    await page.goto(`/admin/orders?buyer=${encodeURIComponent(WANDA.email)}`)
    await expect(
      page.getByText("Orders from an unknown customer")
    ).toBeVisible()
  })

  test("the order page's link uses the rank key, not the email", async ({
    page,
  }) => {
    await page.goto(`/admin/orders/${WANDA.paidNumber}`)
    const link = page.getByRole("link", { name: "View this customer's orders" })
    await expect(link).toHaveAttribute("href", /\/admin\/orders\?buyer=c\d+$/)
  })
})
