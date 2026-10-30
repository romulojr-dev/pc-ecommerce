import type { Page } from "@playwright/test"

import { setStock } from "./stock"
import { expect, test } from "./test"

// Checkout steps 1 and 2 (docs/specs/029-checkout-steps). Needs a seeded
// database (the demo shipping rates and store included). Each test gets a
// fresh browser context, so it starts with no cart. The stock test changes a
// part no other spec uses and restores it in a `finally`.

const RYZEN = "/cpu/amd-ryzen-5-7600"
const GX1000 = "Seasonic FOCUS GX-1000 ATX 3 1000W"
const GX1000_PAGE = "/psu/seasonic-focus-gx-1000-atx-3-1000w"
const GX1000_STOCK = 7

// Opens a page once the header's count request has been answered (see
// cart.spec.ts)
async function open(page: Page, path: string) {
  const counted = page.waitForResponse((r) =>
    r.url().endsWith("/api/cart/count")
  )
  await page.goto(path)
  await counted
}

async function addToCart(page: Page, path: string, extra = 0) {
  await open(page, path)
  for (let i = 0; i < extra; i++) {
    await page.getByRole("button", { name: "Increase quantity" }).click()
  }
  await page.getByRole("button", { name: "Add to cart" }).click()
  await expect(page.getByText(/Added (\d+ )?to your cart\./)).toBeVisible()
}

// /cart, then its Checkout link, with step 1 ready to type in
async function startCheckout(page: Page) {
  await page.goto("/cart")
  await page.getByRole("link", { name: "Checkout" }).click()
  await expect(page).toHaveURL("/checkout")
  await expect(page.getByLabel("Email")).toBeEnabled()
}

async function fillContact(page: Page) {
  await page.getByLabel("Email").fill("ana@example.com")
  await page.getByLabel("Full name").fill("Ana Santos")
  await page.getByLabel("Mobile number").fill("0917 123 4567")
}

async function fillQuezonCity(page: Page) {
  await page
    .getByLabel("Region", { exact: true })
    .selectOption({ label: "National Capital Region (NCR)" })
  await expect(page.getByLabel("Province", { exact: true })).toHaveValue(
    "1300000000"
  )
  await page
    .getByLabel("City / municipality")
    .selectOption({ label: "Quezon City" })
  await page.getByLabel("Barangay").selectOption({ label: "Alicia" })
  await page.getByLabel("Street address").fill("12 Mabini St")
  await page.getByLabel("ZIP code").fill("1100")
}

const heading = (page: Page, name: string) =>
  page.getByRole("heading", { name, level: 2 })

test("an empty cart goes back to /cart (N1)", async ({ page }) => {
  await page.goto("/checkout")
  await expect(page).toHaveURL("/cart")
})

test("cart → details → review with the fee and total (N2, N3, N4, A1, R1)", async ({
  page,
}) => {
  await addToCart(page, RYZEN, 1)
  await startCheckout(page)

  // Every step carries the banner and one current step
  await expect(page.getByText("Test mode.")).toBeVisible()
  await expect(
    page
      .getByRole("navigation", { name: "Checkout steps" })
      .locator('[aria-current="step"]')
  ).toHaveText(/Contact and delivery/)
  await expect(heading(page, "Contact and delivery")).toBeVisible()
  await expect(page.getByText("Subtotal (2 items)")).toBeVisible()

  await fillContact(page)
  await fillQuezonCity(page)

  // A reload in the same tab keeps what was entered (N3)
  await page.reload()
  await expect(page.getByLabel("Email")).toHaveValue("ana@example.com")
  await expect(page.getByLabel("Mobile number")).toHaveValue("0917 123 4567")
  await expect(page.getByLabel("Region", { exact: true })).toHaveValue(
    "1300000000"
  )
  await expect(page.getByLabel("City / municipality")).toHaveValue("1381300000")
  await expect(page.getByLabel("Barangay")).toHaveValue("1381300001")
  await expect(page.getByLabel("ZIP code")).toHaveValue("1100")

  await page.getByRole("button", { name: "Continue to review" }).click()
  await expect(page).toHaveURL("/checkout?step=review")
  await expect(heading(page, "Review your order")).toBeFocused()

  const summary = page.getByRole("complementary", { name: "Order summary" })
  await expect(summary.getByText("Subtotal (2 items)")).toBeVisible()
  await expect(summary.getByText("₱22,990.00")).toBeVisible()
  await expect(summary.getByText("₱120.00")).toBeVisible()
  await expect(summary.getByText("₱23,110.00")).toBeVisible()
  await expect(
    summary.getByText("Free shipping on orders of ₱75,000.00 or more.")
  ).toBeVisible()
  await expect(page.getByText("12 Mabini St")).toBeVisible()
  await expect(
    page.getByText("Alicia, Quezon City, Metro Manila, National Capital Region")
  ).toBeVisible()

  // Place order waits for #78 (N11)
  await expect(page.getByRole("button", { name: "Place order" })).toBeDisabled()
  await expect(page.getByText("Placing orders is coming soon.")).toBeVisible()

  // Back and Forward move between the steps and keep the details (N4, N17)
  await page.goBack()
  await expect(page).toHaveURL("/checkout")
  await expect(heading(page, "Contact and delivery")).toBeFocused()
  await expect(page.getByLabel("Full name")).toHaveValue("Ana Santos")
  await page.goForward()
  await expect(heading(page, "Review your order")).toBeVisible()
  await expect(summary.getByText("₱23,110.00")).toBeVisible()
})

test("store pickup skips the address (N10, A7)", async ({ page }) => {
  await addToCart(page, RYZEN)
  await startCheckout(page)
  await fillContact(page)

  await page.getByLabel("Store pickup").check()
  await expect(page.getByLabel("Region", { exact: true })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Pick up at" })).toBeVisible()
  await expect(page.getByText("PC Silicon Demo Store")).toBeVisible()

  await page.getByRole("button", { name: "Continue to review" }).click()
  await expect(heading(page, "Review your order")).toBeVisible()
  const summary = page.getByRole("complementary", { name: "Order summary" })
  await expect(summary.getByText("Free (pickup)")).toBeVisible()
  await expect(page.getByText("Store pickup", { exact: true })).toBeVisible()
  await expect(summary.getByText("₱11,495.00").last()).toBeVisible()
})

test("an independent city is under its geographic province (A2, A2b, A3, AD1, AD7)", async ({
  page,
}) => {
  await addToCart(page, RYZEN)
  await startCheckout(page)
  await fillContact(page)

  await page
    .getByLabel("Region", { exact: true })
    .selectOption({ label: "Region VII (Central Visayas)" })
  await expect(
    page.getByLabel("Province", { exact: true }).locator("option")
  ).toHaveText(["Choose a province", "Bohol", "Cebu"])
  await page.getByLabel("Province", { exact: true }).selectOption("Cebu")
  await page
    .getByLabel("City / municipality")
    .selectOption({ label: "City of Cebu" })
  await page.getByLabel("Barangay").selectOption({ label: "Adlaon" })
  await page.getByLabel("Street address").fill("1 Colon St")
  await page.getByLabel("ZIP code").fill("6000")

  await page.getByRole("button", { name: "Continue to review" }).click()
  await expect(
    page.getByText(
      "Adlaon, City of Cebu, Cebu, Region VII (Central Visayas) 6000"
    )
  ).toBeVisible()
  const summary = page.getByRole("complementary", { name: "Order summary" })
  // 450 g to Visayas: the first tier
  await expect(summary.getByText("₱190.00")).toBeVisible()
  await expect(summary.getByText("₱11,685.00")).toBeVisible()
})

test("changing a parent clears its children and keeps street and ZIP (A4)", async ({
  page,
}) => {
  await addToCart(page, RYZEN)
  await startCheckout(page)
  await fillQuezonCity(page)

  await page
    .getByLabel("Region", { exact: true })
    .selectOption({ label: "Region VII (Central Visayas)" })
  await expect(page.getByLabel("Province", { exact: true })).toHaveValue("")
  await expect(page.getByLabel("City / municipality")).toHaveValue("")
  await expect(page.getByLabel("Barangay")).toHaveValue("")
  await expect(page.getByLabel("Street address")).toHaveValue("12 Mabini St")
  await expect(page.getByLabel("ZIP code")).toHaveValue("1100")
})

test("empty fields explain themselves and focus the first one (N6)", async ({
  page,
}) => {
  await addToCart(page, RYZEN)
  await startCheckout(page)

  await page.getByRole("button", { name: "Continue to review" }).click()
  await expect(page).toHaveURL("/checkout")
  await expect(page.getByText("Enter your email.")).toBeVisible()
  await expect(page.getByText("Enter your full name.")).toBeVisible()
  await expect(page.getByText("Enter your mobile number.")).toBeVisible()
  await expect(page.getByText("Choose your region.")).toBeVisible()
  await expect(page.getByText("Enter your street address.")).toBeVisible()
  await expect(page.getByLabel("Email")).toBeFocused()
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true")
})

test("a link to the review without saved details goes to step 1 (N5)", async ({
  page,
}) => {
  await addToCart(page, RYZEN)
  await page.goto("/checkout")
  await expect(page.getByLabel("Email")).toBeEnabled()
  await page.evaluate(() => sessionStorage.clear())

  let reviewed = false
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/checkout")) {
      reviewed = true
    }
  })
  await page.goto("/checkout?step=review")
  await expect(page).toHaveURL("/checkout")
  await expect(heading(page, "Contact and delivery")).toBeVisible()
  await expect(page.getByLabel("Email")).toHaveValue("")
  // A first load moves no focus (N19)
  await expect(heading(page, "Contact and delivery")).not.toBeFocused()
  expect(reviewed).toBe(false)
})

test("a cart over its stock shows on step 1 and blocks the review (N13, R8, N9, N16, N18)", async ({
  page,
}) => {
  await setStock(GX1000, GX1000_STOCK)
  try {
    await addToCart(page, GX1000_PAGE, 2)
    await setStock(GX1000, 1)

    await page.goto("/checkout")
    const problems = page.getByRole("region", {
      name: "1 problem to fix before you can order",
    })
    await expect(problems).toBeVisible()
    await expect(
      problems.getByText(`${GX1000}: Only 1 in stock, 3 in your cart`)
    ).toBeVisible()
    await expect(
      problems.getByRole("link", { name: "Back to cart" })
    ).toHaveAttribute("href", "/cart")

    await fillContact(page)
    await fillQuezonCity(page)
    await page.getByRole("button", { name: "Continue to review" }).click()

    // The blocked review: the problem summary takes focus
    await expect(
      page.getByRole("heading", {
        name: "1 problem to fix before you can order",
      })
    ).toBeFocused()
    await expect(
      page.getByRole("button", { name: "Place order" })
    ).toBeDisabled()
    // Totals still show (D8): 3 × ₱9,995.00 and 7.5 kg to Metro Manila
    await expect(page.getByText("₱29,985.00").first()).toBeVisible()

    // Stock is restored: Check again finds nothing, and says so
    await setStock(GX1000, GX1000_STOCK)
    await page.getByRole("button", { name: "Check again" }).click()
    await expect(
      page.getByText("Checked just now. No problems found.")
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Check again" })
    ).toBeFocused()
    await expect(page.getByText("Placing orders is coming soon.")).toBeVisible()
  } finally {
    await setStock(GX1000, GX1000_STOCK)
  }
})
