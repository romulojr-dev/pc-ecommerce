import { authFile } from "./accounts"
import {
  insertAuditFixtures,
  NOTE,
  PRODUCT,
  removeAuditFixtures,
} from "./admin-audit-fixtures"
import { expect, test } from "./test"

// docs/specs/047-admin-audit-log-view, T-E2E: the owner records a real stock
// adjustment and finds it in the log with a readable diff and a link; the
// filters narrow it; Staff has no access; Demo sees the entry with the note
// hidden, also in the RSC payload. No audit rows are inserted by SQL. The
// product is throwaway (SKU prefix). One worker: the tests share it.

test.describe.configure({ mode: "serial" })

test.beforeAll(insertAuditFixtures)
test.afterAll(removeAuditFixtures)

const manilaDay = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  })

test.describe("owner", () => {
  test.use({ storageState: authFile("owner") })

  test("a real adjustment shows up first, with its diff and a link", async ({
    page,
  }) => {
    await page.goto(`/admin/inventory?q=${PRODUCT.sku}`)
    await page.getByRole("link", { name: PRODUCT.name }).click()
    await expect(page).toHaveURL(/\/admin\/inventory\/[^/?]+$/, {
      timeout: 20_000,
    })
    await page.getByLabel("Reason").selectOption({ label: "Received" })
    await page.getByLabel("Quantity").fill("5")
    await page.getByLabel(/^Note/).fill(NOTE)
    await page.getByRole("button", { name: "Review adjustment" }).click()
    await page.getByRole("button", { name: "Confirm" }).click()
    await expect(page.getByText("Stock is now 15.")).toBeVisible()

    await page.goto("/admin/audit")
    await expect(
      page.getByRole("heading", { level: 1, name: "Audit log" })
    ).toBeVisible()
    // Newest first: the entry just made is the first data row
    const row = page.getByRole("row").nth(1)
    await expect(row).toContainText("Product · Stock adjusted")
    await expect(row).toContainText("E2E Owner (Owner)")
    await row.getByText("Show changes").click()
    await expect(row.getByRole("row", { name: /^Stock 10 15/ })).toBeVisible()
    await expect(
      row.getByRole("row", { name: /^Reason .*Received/ })
    ).toBeVisible()
    await expect(row).toContainText(NOTE)
    // Raw JSON is never drawn
    await expect(page.getByText("{", { exact: false })).toHaveCount(0)

    await row.getByRole("link", { name: new RegExp(PRODUCT.name) }).click()
    await expect(page).toHaveURL(/\/admin\/products\/e2eaud-alpha$/, {
      timeout: 20_000,
    })
  })

  test("filters narrow the log; a bad value is dropped", async ({ page }) => {
    await page.goto("/admin/audit")
    await page.getByLabel("Entity").selectOption({ label: "Product" })
    await page.getByLabel("Person").selectOption({ label: "E2E Owner (Owner)" })
    await page.getByLabel("From (Philippine time)").fill(manilaDay())
    await page.getByLabel("To (Philippine time)").fill(manilaDay())
    await page.getByRole("button", { name: "Apply" }).click()
    await expect(page).toHaveURL(/entity=product/)
    await expect(page).toHaveURL(new RegExp(`from=${manilaDay()}`))
    await expect(
      page.getByText("Product · Stock adjusted").first()
    ).toBeVisible()

    // Another entity has none of it
    await page.goto("/admin/audit?entity=refund")
    await expect(
      page.getByText("No changes match these filters.")
    ).toBeVisible()
    await expect(page.getByText("Product · Stock adjusted")).toHaveCount(0)

    // Tomorrow onward is empty too
    await page.goto(`/admin/audit?from=${manilaDay(1)}`)
    await expect(
      page.getByText("No changes match these filters.")
    ).toBeVisible()

    // An unknown entity is dropped by a redirect
    await page.goto("/admin/audit?entity=widget")
    await expect(page).toHaveURL(/\/admin\/audit$/)
  })
})

test.describe("staff", () => {
  test.use({ storageState: authFile("staff") })

  test("has no Audit log item and no access to the page", async ({ page }) => {
    await page.goto("/admin/inventory")
    await expect(
      page.getByRole("link", { name: "Audit log", exact: true })
    ).toHaveCount(0)
    await page.goto("/admin/audit")
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" })
    ).toBeVisible()
    await expect(page.getByText("Product · Stock adjusted")).toHaveCount(0)
  })
})

test.describe("demo", () => {
  test.use({ storageState: authFile("demo") })

  test("sees the entry with the staff note hidden", async ({ page }) => {
    await page.goto("/admin/audit?entity=product")
    await expect(
      page.getByText("Customer details are hidden in the demo.")
    ).toBeVisible()
    const row = page.getByRole("row", { name: /E2E Audit Alpha/ }).first()
    await expect(row).toContainText("Product · Stock adjusted")
    await row.getByText("Show changes").click()
    await expect(row).toContainText("Hidden in demo")
    await expect(row.getByRole("row", { name: /^Stock 10 15/ })).toBeVisible()
    await expect(page.getByText(NOTE)).toHaveCount(0)
  })

  test("is sent the note nowhere, not even in the RSC payload", async ({
    page,
  }) => {
    const path = "/admin/audit?entity=product"
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
