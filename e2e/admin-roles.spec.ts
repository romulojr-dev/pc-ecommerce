import { authFile, type Role } from "./accounts"
import { expect, test } from "./test"

// docs/specs/040-admin-permissions-audit-masking, T13: the three roles land on
// Orders, see only what their role may use, and Demo is told what it is looking
// at. (The no-access page has no route to open yet: no Admin screen needs a
// view action Staff lacks. It is covered by components/admin/shell.test.tsx.)

const DEMO_NOTICE = "Demo: customer details are hidden"

for (const role of ["owner", "staff", "demo"] as const satisfies Role[]) {
  test.describe(`signed in as ${role}`, () => {
    test.use({ storageState: authFile(role) })

    test("lands on Orders and sees the Orders link", async ({ page }) => {
      await page.goto("/admin")
      await expect(page).toHaveURL(/\/admin\/orders$/)
      await expect(
        page.getByRole("heading", { name: "Orders", level: 1 })
      ).toBeVisible()
      await expect(
        page.getByRole("link", { name: "Orders", exact: true })
      ).toBeVisible()
    })

    test(`${role === "demo" ? "shows" : "does not show"} the demo notice`, async ({
      page,
    }) => {
      await page.goto("/admin/orders")
      const notice = page.getByTestId("admin-demo-notice")
      if (role === "demo") {
        await expect(notice).toHaveText(DEMO_NOTICE)
      } else {
        await expect(notice).toHaveCount(0)
      }
    })
  })
}
