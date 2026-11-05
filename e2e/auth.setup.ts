import { mkdirSync } from "node:fs"

import {
  ACCOUNTS,
  authFile,
  MISSING_ACCOUNT,
  passwordFor,
  ROLES,
  setClientIp,
} from "./accounts"
import { expect, test as setup } from "./test"

// Signs in once per role through the real form and saves the browser state
// (docs/specs/039-staff-sign-in-admin-shell, E1). The admin specs reuse it
// instead of signing in again, so they never trip the sign-in limit. Each
// sign-in has its own client IP. Runs as the "setup" project, before the
// "admin" project; the storefront specs don't depend on it.

mkdirSync("e2e/.auth", { recursive: true })

for (const role of ROLES) {
  const account = ACCOUNTS[role]

  setup(`sign in as ${role}`, async ({ page }) => {
    const password = passwordFor(role)
    await setClientIp(page)

    await page.goto("/admin/login")
    await page.getByLabel("Email").fill(account.email)
    await page.getByLabel("Password").fill(password)
    await page.getByRole("button", { name: "Sign in" }).click()

    // A missing account looks like a wrong password: say what to do
    const orders = page.getByRole("heading", { name: "Orders", level: 1 })
    const refused = page.getByText("Email or password is incorrect.")
    await expect(orders.or(refused)).toBeVisible()
    if (await refused.isVisible()) throw new Error(MISSING_ACCOUNT(role))

    // E1: every role lands on the placeholder, and the header names the person
    await expect(page).toHaveURL(/\/admin\/orders$/)
    await expect(page.getByTestId("admin-person")).toHaveText(
      `${account.name} · ${account.label}`
    )

    await page.context().storageState({ path: authFile(role) })
  })
}
