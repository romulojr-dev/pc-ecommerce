import type { Page } from "@playwright/test"

import { authFile } from "./accounts"
import {
  createCancelOrders,
  NOTE,
  PAID,
  PENDING,
  RACE,
  RAW_VALUES,
  removeCancelOrders,
  SHIPPED,
  tokenOf,
  UNTOUCHED,
} from "./admin-cancel-fixtures"
import { expect, test } from "./test"

// docs/specs/044-admin-cancel-order, T-E2E: staff cancel a paid order and an
// unpaid one from the dialog (reason required, note for Other, effects listed),
// the customer's page and the dev inbox show the right sentences, a second tab
// is told the order changed, Shipped has no Cancel button, and Demo sees a
// disabled button and no raw values (also in the RSC payload). The orders are
// inserted by e2e/admin-cancel-fixtures.ts and removed after. One worker: the
// fixtures are shared.

test.describe.configure({ mode: "serial" })

test.beforeAll(createCancelOrders)
test.afterAll(removeCancelOrders)

const orderPath = (number: string) => `/admin/orders/${number}`
const dialog = (page: Page) => page.getByRole("dialog")
const cancelButton = (page: Page) =>
  page.getByRole("button", { name: "Cancel order", exact: true })

test.describe("staff", () => {
  test.use({ storageState: authFile("staff") })

  test("cancels a paid order and flags it for a refund", async ({ page }) => {
    await page.goto(orderPath(PAID.number))
    await expect(page.getByText("Status: Paid")).toBeVisible()

    await cancelButton(page).click()
    // the effects of a paid order are listed
    await expect(
      dialog(page).getByText(
        "The order becomes Cancelled. This can't be undone."
      )
    ).toBeVisible()
    await expect(
      dialog(page).getByText(
        /was paid\. The order will be marked Refund required/
      )
    ).toBeVisible()

    // a reason is required
    await dialog(page).getByRole("button", { name: "Cancel order" }).click()
    await expect(dialog(page).getByText("Choose a reason.")).toBeVisible()

    await dialog(page).getByLabel("Customer asked to cancel").check()
    await dialog(page).getByRole("button", { name: "Cancel order" }).click()
    await expect(
      page.getByText("Order cancelled. The customer will get an email shortly.")
    ).toBeVisible()
    await expect(
      page.getByText("Refund required: record it once")
    ).toBeVisible()
    await expect(page.getByText("Status: Cancelled")).toBeVisible()
    await expect(
      page.getByText("Cancelled: Customer asked to cancel")
    ).toBeVisible()
    await expect(cancelButton(page)).toHaveCount(0)

    // the orders list shows the refund badge
    await page.goto("/admin/orders?status=CANCELLED")
    const row = page.getByRole("row").filter({ hasText: PAID.number })
    await expect(row).toContainText("Refund required")

    // the customer's page says a refund will follow
    await page.goto(`/orders/${PAID.number}?key=${tokenOf(PAID.number)}`)
    await expect(
      page.getByText(
        "This order was cancelled because you asked us to cancel it."
      )
    ).toBeVisible()
    await expect(page.getByText("We'll refund your payment.")).toBeVisible()
    await expect(page.getByText("You haven't been charged.")).toHaveCount(0)
  })

  test("cancels an unpaid order with Other, which needs a note", async ({
    page,
  }) => {
    await page.goto(orderPath(PENDING.number))
    await cancelButton(page).click()
    await expect(
      dialog(page).getByText("The customer has not been charged.")
    ).toBeVisible()

    await dialog(page).getByLabel("Other").check()
    await dialog(page).getByRole("button", { name: "Cancel order" }).click()
    await expect(
      dialog(page).getByText("Add a note (3 to 200 characters).")
    ).toBeVisible()
    await dialog(page).getByLabel("Note").fill(NOTE)
    await dialog(page).getByRole("button", { name: "Cancel order" }).click()
    await expect(
      page.getByText("Order cancelled. The customer will get an email shortly.")
    ).toBeVisible()
    await expect(page.getByText("Refund required: record it once")).toHaveCount(
      0
    )

    // the customer's page says nothing was charged, and shows no note
    await page.goto(`/orders/${PENDING.number}?key=${tokenOf(PENDING.number)}`)
    await expect(page.getByText("This order was cancelled.")).toBeVisible()
    await expect(page.getByText("You haven't been charged.")).toBeVisible()
    expect(await page.content()).not.toContain(NOTE)
  })

  test("the cancelled emails reach the dev inbox without the note", async ({
    page,
  }) => {
    await expect
      .poll(
        async () => {
          await page.goto("/dev/emails")
          const content = await page.content()
          return (
            content.includes(`Order ${PAID.number} was cancelled`) &&
            content.includes(`Order ${PENDING.number} was cancelled`)
          )
        },
        { timeout: 30_000 }
      )
      .toBe(true)
    expect(await page.content()).not.toContain(NOTE)
  })

  test("a second tab is told the order changed, and Reload shows it", async ({
    browser,
    page,
  }) => {
    await page.goto(orderPath(RACE.number))
    const other = await browser.newContext({ storageState: authFile("staff") })
    const second = await other.newPage()
    await second.goto(orderPath(RACE.number))

    await cancelButton(page).click()
    await dialog(page).getByLabel("Out of stock").check()
    await dialog(page).getByRole("button", { name: "Cancel order" }).click()
    await expect(page.getByText("Status: Cancelled")).toBeVisible()

    await cancelButton(second).click()
    await second.getByRole("dialog").getByLabel("Out of stock").check()
    await second
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel order" })
      .click()
    await expect(
      second
        .getByRole("alert")
        .getByText(
          "This order was changed by someone else. Reload to see its current status."
        )
    ).toBeVisible()
    await second.getByRole("button", { name: "Reload" }).click()
    await expect(second.getByText("Status: Cancelled")).toBeVisible()
    await other.close()
  })

  test("a shipped order has no Cancel button", async ({ page }) => {
    await page.goto(orderPath(SHIPPED.number))
    await expect(page.getByText("Status: Shipped")).toBeVisible()
    await expect(cancelButton(page)).toHaveCount(0)
  })
})

test.describe("demo", () => {
  test.use({ storageState: authFile("demo") })

  test("sees a disabled Cancel button and no raw values, even in the payload", async ({
    page,
  }) => {
    await page.goto(orderPath(UNTOUCHED.number))
    await expect(cancelButton(page)).toBeDisabled()
    await expect(
      page.getByText("This account is read-only").first()
    ).toBeVisible()

    const path = orderPath(UNTOUCHED.number)
    const html = await (await page.request.get(path)).text()
    const rsc = await (
      await page.request.get(path, {
        headers: { RSC: "1", Accept: "text/x-component" },
      })
    ).text()
    for (const [label, body] of [
      ["html", html],
      ["rsc", rsc],
    ] as const) {
      const lower = body.toLowerCase()
      for (const value of [...RAW_VALUES, NOTE]) {
        expect(
          lower.includes(value.toLowerCase()),
          `${path} (${label}) holds "${value}"`
        ).toBe(false)
      }
    }
  })
})
