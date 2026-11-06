import type { Page } from "@playwright/test"

import { authFile } from "./accounts"
import {
  readProduct,
  removeE2eProducts,
  SKU_PREFIX,
} from "./admin-product-fixtures"
import { expect, test } from "./test"

// docs/specs/045-admin-products-create-edit, T-E2E: the owner creates and edits
// a product through the generated form; errors, a SKU clash and a stale tab are
// shown as text; Demo sees everything read-only; Staff has no Products screen.
// The products are throwaway (SKU prefix) and removed before and after. One
// worker: they share the SKUs.

test.describe.configure({ mode: "serial" })

test.beforeAll(removeE2eProducts)
test.afterAll(removeE2eProducts)

const SKU = `${SKU_PREFIX}RM1000E`
const NAME = "E2E Corsair RM1000e"

async function fillPsuForm(
  page: Page,
  sku = SKU,
  slug = "e2e-corsair-rm1000e"
) {
  await page.getByLabel(/^Name/).fill(NAME)
  await page.getByLabel(/^SKU/).fill(sku)
  await page.getByLabel(/^Slug/).fill(slug)
  await page.getByLabel(/^Brand/).selectOption({ label: "Corsair" })
  await page.getByLabel(/^Price \(₱\)/).fill("9,499.50")
  await page.getByLabel(/^Weight/).fill("2100")
  await page.getByLabel(/^Wattage/).fill("1000")
  await page.getByLabel(/^Form factor/).selectOption("ATX")
  await page.getByLabel(/^Efficiency/).selectOption("GOLD")
  await page.getByLabel(/^Modularity/).selectOption("FULL")
}

test.describe("owner", () => {
  test.use({ storageState: authFile("owner") })

  test("creates a draft: errors first, then saved, then listed", async ({
    page,
  }) => {
    await page.goto("/admin/products/new")
    await page.getByRole("link", { name: "Power Supply" }).click()
    await expect(page).toHaveURL(/category=psu/)

    // An empty form lists every problem and saves nothing
    await page.getByRole("button", { name: "Save draft" }).click()
    await expect(page.getByRole("alert").first()).toContainText(
      /Fix \d+ problems to save/
    )
    await expect(
      page.getByText("Enter a price in pesos, like 1,299.50.", { exact: true })
    ).toBeVisible()

    await fillPsuForm(page)
    // A sale price that is not below the price is a field error
    await page.getByLabel(/^Sale price/).fill("9,499.50")
    await page.getByRole("button", { name: "Save draft" }).click()
    await expect(
      page.getByText("Sale price must be lower than the price.", {
        exact: true,
      })
    ).toBeVisible()
    expect(await readProduct(SKU)).toBeNull()

    await page.getByLabel(/^Sale price/).fill("")
    await page.getByRole("button", { name: "Save draft" }).click()
    await expect(page.getByText("Draft saved.")).toBeVisible()
    await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?saved=draft/)
    await expect(page.getByText("Stock: 0.")).toBeVisible()

    const stored = await readProduct(SKU)
    expect(stored).toMatchObject({ price: 949950, stock: 0, status: "DRAFT" })

    await page.goto(`/admin/products?q=${SKU_PREFIX}&status=draft`)
    const row = page.getByRole("row").filter({ hasText: SKU })
    await expect(row).toContainText("Draft")
    await expect(row).toContainText("₱9,499.50")
  })

  test("a SKU that is taken is a field error, not a crash", async ({
    page,
  }) => {
    await page.goto("/admin/products/new?category=psu")
    await fillPsuForm(page, SKU.toLowerCase(), "e2e-other-slug")
    await page.getByRole("button", { name: "Save draft" }).click()
    await expect(
      page.getByText("This SKU is already used by another product.").first()
    ).toBeVisible()
  })

  test("edits a price, and a second tab is told it is stale", async ({
    page,
    context,
  }) => {
    await page.goto(`/admin/products?q=${SKU_PREFIX}`)
    await page.getByRole("link", { name: NAME }).click()
    await expect(page).toHaveURL(/\/admin\/products\/[^/?]+$/)
    const other = await context.newPage()
    await other.goto(page.url())

    await page.getByLabel(/^Price \(₱\)/).fill("9,000")
    await page.getByRole("button", { name: "Save draft" }).click()
    await expect(page.getByText("Changes saved.")).toBeVisible()
    expect((await readProduct(SKU))?.price).toBe(900000)

    await other.getByLabel(/^Price \(₱\)/).fill("8,000")
    await other.getByRole("button", { name: "Save draft" }).click()
    await expect(
      other.getByText(/This product was changed by someone else/)
    ).toBeVisible()
    expect((await readProduct(SKU))?.price).toBe(900000)

    await other.getByRole("button", { name: "Reload" }).click()
    await expect(other.getByLabel(/^Price \(₱\)/)).toHaveValue("9000.00")
    await other.close()
  })

  test("a draft's category can change and the specs start empty", async ({
    page,
  }) => {
    await page.goto(`/admin/products?q=${SKU_PREFIX}`)
    await page.getByRole("link", { name: NAME }).click()
    await expect(page).toHaveURL(/\/admin\/products\/[^/?]+$/)
    await page.getByLabel(/^Category/).selectOption("cpu")
    await expect(
      page.getByText("Changing the category clears the specifications")
    ).toBeVisible()
    await expect(page.getByLabel(/^Socket/)).toHaveValue("")
    // Saving without the CPU's specs saves nothing
    await page.getByRole("button", { name: "Save draft" }).click()
    await expect(page.getByRole("alert").first()).toContainText(
      /problems? to save/
    )
  })
})

test.describe("demo", () => {
  test.use({ storageState: authFile("demo") })

  test("sees the list and the form, but can change nothing", async ({
    page,
  }) => {
    await page.goto(`/admin/products?q=${SKU_PREFIX}`)
    await expect(
      page.getByRole("button", { name: "New product" })
    ).toBeDisabled()
    await page.getByRole("link", { name: NAME }).click()
    await expect(page.getByText("This account is read-only.")).toBeVisible()
    await expect(page.getByLabel(/^Name/)).toBeDisabled()
    await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(
      0
    )
  })
})

test.describe("staff", () => {
  test.use({ storageState: authFile("staff") })

  test("has no Products screen", async ({ page }) => {
    await page.goto("/admin/orders")
    await expect(page.getByRole("link", { name: "Products" })).toHaveCount(0)
    await page.goto("/admin/products")
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" })
    ).toBeVisible()
  })
})
