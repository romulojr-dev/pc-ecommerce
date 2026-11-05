import type { Page } from "@playwright/test"

import { authFile } from "./accounts"
import {
  CASH_PICKUP,
  CASH_PICKUP_TOTAL,
  createFulfillmentOrders,
  ONLINE_DELIVERY,
  RACE,
  RAW_VALUES,
  removeFulfillmentOrders,
  SHIPPED,
  tokenOf,
} from "./admin-fulfillment-fixtures"
import { expect, test } from "./test"

// docs/specs/043-order-fulfillment-transitions, T-E2E: staff walk an online
// delivery order and a cash pickup order through fulfillment, the Shipped
// dialog has a confirm step, a second tab sees the stale message, Demo sees
// disabled controls and a masked tracking number (also in the RSC payload),
// and the customer's page shows the courier and tracking number. The orders
// are inserted by e2e/admin-fulfillment-fixtures.ts and removed after. One
// worker: the fixtures are shared.

test.describe.configure({ mode: "serial" })

test.beforeAll(createFulfillmentOrders)
test.afterAll(removeFulfillmentOrders)

const orderPath = (number: string) => `/admin/orders/${number}`
const dialog = (page: Page) => page.getByRole("dialog")

async function confirmMove(page: Page, button: string) {
  await page.getByRole("button", { name: button }).click()
  await dialog(page).getByRole("button", { name: "Confirm" }).click()
}

test.describe("staff", () => {
  test.use({ storageState: authFile("staff") })

  test("walks an online delivery order to Delivered", async ({ page }) => {
    await page.goto(orderPath(ONLINE_DELIVERY.number))
    await expect(page.getByText("Status: Paid")).toBeVisible()

    // Processing: the confirmation says no email goes out
    await page.getByRole("button", { name: "Start processing" }).click()
    await expect(
      dialog(page).getByText("No email is sent for this step.")
    ).toBeVisible()
    await expect(dialog(page).getByText("This can't be undone.")).toBeVisible()
    await dialog(page).getByRole("button", { name: "Confirm" }).click()
    await expect(page.getByText("Marked as processing.")).toBeVisible()
    await expect(page.getByText("Status: Processing")).toBeVisible()

    // Shipped: fields first, then a confirm step with both shown big
    await page.getByRole("button", { name: "Mark as shipped" }).click()
    const options = dialog(page).locator("datalist option")
    await expect(options).toHaveCount(5)
    await dialog(page).getByRole("button", { name: "Review" }).click()
    await expect(dialog(page).getByText("Enter the courier.")).toBeVisible()
    await expect(
      dialog(page).getByText("Enter the tracking number.")
    ).toBeVisible()

    await dialog(page).getByLabel("Courier").fill("J&T Express")
    await dialog(page).getByLabel("Tracking number").fill("JT12 34")
    await dialog(page).getByRole("button", { name: "Review" }).click()
    await expect(
      dialog(page).getByText(/Tracking number must be 4 to 40/)
    ).toBeVisible()
    await dialog(page).getByLabel("Tracking number").fill("JT1234567890")
    await dialog(page).getByRole("button", { name: "Review" }).click()

    await expect(dialog(page).getByText("Check these details")).toBeVisible()
    await expect(dialog(page).getByText("J&T Express")).toBeVisible()
    await expect(dialog(page).getByText("JT1234567890")).toBeVisible()
    await expect(
      dialog(page).getByText(
        "Both are emailed to the customer and can't be changed."
      )
    ).toBeVisible()

    // Back keeps the values; nothing was sent
    await dialog(page).getByRole("button", { name: "Back" }).click()
    await expect(dialog(page).getByLabel("Courier")).toHaveValue("J&T Express")
    await dialog(page).getByRole("button", { name: "Review" }).click()
    await dialog(page).getByRole("button", { name: "Confirm" }).click()
    await expect(
      page.getByText(
        "Marked as shipped. The customer will get an email shortly."
      )
    ).toBeVisible()
    await expect(page.getByText("Tracking number: JT1234567890")).toBeVisible()

    // The customer's page shows the courier and tracking number
    await page.goto(
      `/orders/${ONLINE_DELIVERY.number}?key=${tokenOf(ONLINE_DELIVERY.number)}`
    )
    await expect(page.getByText("Courier: J&T Express")).toBeVisible()
    await expect(page.getByText("Tracking number: JT1234567890")).toBeVisible()

    // Delivered, then no move is left
    await page.goto(orderPath(ONLINE_DELIVERY.number))
    await confirmMove(page, "Mark as delivered")
    await expect(
      page.getByText(
        "Marked as delivered. The customer will get an email shortly."
      )
    ).toBeVisible()
    await expect(
      page.getByText("Delivered. Nothing more to do here.")
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Mark as delivered" })
    ).toHaveCount(0)
  })

  test("the emails reach the dev inbox", async ({ page }) => {
    await expect
      .poll(
        async () => {
          await page.goto("/dev/emails")
          return (await page.content()).includes(
            `Order ${ONLINE_DELIVERY.number} has shipped`
          )
        },
        { timeout: 30_000 }
      )
      .toBe(true)
    const content = await page.content()
    expect(content).toContain(`Order ${ONLINE_DELIVERY.number} was delivered`)
  })

  test("walks a cash pickup order and records the cash", async ({ page }) => {
    await page.goto(orderPath(CASH_PICKUP.number))
    await confirmMove(page, "Start processing")
    await expect(page.getByText("Status: Processing")).toBeVisible()
    await confirmMove(page, "Mark as ready for pickup")
    await expect(page.getByText("Status: Ready for pickup")).toBeVisible()

    await page.getByRole("button", { name: "Mark as picked up" }).click()
    await expect(
      dialog(page).getByText(
        `${CASH_PICKUP_TOTAL} will be recorded as paid in cash.`
      )
    ).toBeVisible()
    await expect(
      dialog(page).getByText("No email is sent for this step.")
    ).toBeVisible()
    await dialog(page).getByRole("button", { name: "Confirm" }).click()
    await expect(page.getByText("Marked as picked up.")).toBeVisible()
    await expect(page.getByText("Status: Picked up")).toBeVisible()

    // It counts as a sale now: the customer's total spent
    await page.goto(
      `/admin/customers?customer=${encodeURIComponent("dimaculangan")}`
    )
    const row = page.getByRole("row").filter({ hasText: CASH_PICKUP.name })
    await expect(row).toContainText(CASH_PICKUP_TOTAL)
  })

  test("a second tab is told the order changed, and Reload shows it", async ({
    browser,
    page,
  }) => {
    await page.goto(orderPath(RACE.number))
    const other = await browser.newContext({ storageState: authFile("staff") })
    const second = await other.newPage()
    await second.goto(orderPath(RACE.number))

    await confirmMove(page, "Start processing")
    await expect(page.getByText("Marked as processing.")).toBeVisible()

    await second.getByRole("button", { name: "Start processing" }).click()
    await second
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm" })
      .click()
    await expect(
      second
        .getByRole("alert")
        .getByText(
          "This order was changed by someone else. Reload to see its current status."
        )
    ).toBeVisible()
    await second.getByRole("button", { name: "Reload" }).click()
    await expect(second.getByText("Status: Processing")).toBeVisible()
    await other.close()
  })
})

test.describe("demo", () => {
  test.use({ storageState: authFile("demo") })

  test("sees disabled controls and a masked tracking number, even in the payload", async ({
    page,
  }) => {
    await page.goto(orderPath(SHIPPED.number))
    await expect(page.getByText("Courier: LBC")).toBeVisible()
    await expect(page.getByText("Tracking number: •••• 4217")).toBeVisible()
    const button = page.getByRole("button", { name: "Mark as delivered" })
    await expect(button).toBeDisabled()
    await expect(page.getByText("This account is read-only")).toBeVisible()

    for (const path of [
      orderPath(SHIPPED.number),
      `${orderPath(SHIPPED.number)}/packing-slip`,
    ]) {
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
        for (const value of RAW_VALUES) {
          expect(
            lower.includes(value.toLowerCase()),
            `${path} (${label}) holds "${value}"`
          ).toBe(false)
        }
      }
      expect(html).toContain("•••• 4217")
    }
  })
})
