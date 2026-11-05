import type { Browser, Page } from "@playwright/test"

import {
  ACCOUNTS,
  authFile,
  MISSING_ACCOUNT,
  newIp,
  passwordFor,
  type Role,
  setClientIp,
} from "./accounts"
import { expect, test } from "./test"

// docs/specs/039-staff-sign-in-admin-shell: E2–E18. E1 is the setup project
// (e2e/auth.setup.ts). Tests that sign in themselves use a client IP of their
// own, so nothing here trips the 3-per-10-seconds sign-in limit.

const signedOut = { cookies: [], origins: [] }

async function fillAndSubmit(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
}

// A new signed-out browser context with its own IP, signed in through the form
async function signInFresh(browser: Browser, role: Role, next?: string) {
  const context = await browser.newContext({ storageState: signedOut })
  await setClientIp(context)
  const page = await context.newPage()
  await page.goto(next ? `/admin/login?next=${next}` : "/admin/login")
  await fillAndSubmit(page, ACCOUNTS[role].email, passwordFor(role))
  return { context, page }
}

test.describe("signed out", () => {
  test.use({ storageState: signedOut })

  test("E2: /admin/orders goes to the form, and signing in comes back", async ({
    page,
  }) => {
    await setClientIp(page)
    await page.goto("/admin/orders")
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Forders$/)
    await expect(
      page.getByRole("heading", { name: "Staff sign in", level: 1 })
    ).toBeVisible()

    await fillAndSubmit(page, ACCOUNTS.staff.email, passwordFor("staff"))
    await expect(page).toHaveURL(/\/admin\/orders$/)
    await expect(
      page.getByRole("heading", { name: "Orders", level: 1 })
    ).toBeVisible()
  })

  test("E13: /admin/login renders with no redirect", async ({ page }) => {
    const response = await page.goto("/admin/login")
    expect(response?.status()).toBe(200)
    expect(response?.request().redirectedFrom()).toBeNull()
    await expect(page).toHaveURL(/\/admin\/login$/)
    await expect(page.getByLabel("Email")).toBeVisible()
  })

  test("a signed-out visit to an unknown /admin path ends at the form", async ({
    page,
  }) => {
    await page.goto("/admin/nonsense")
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fnonsense$/)
  })

  test("a cookie the server doesn't know is the form too, with no loop (R6)", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: "not-a-real-token.signature",
        url: baseURL!,
      },
    ])
    await page.goto("/admin/orders")
    await expect(page).toHaveURL(/\/admin\/login$/)
    await expect(page.getByLabel("Email")).toBeVisible()
  })

  test("E5: a wrong password gives the generic line, clears the password and focuses it", async ({
    page,
  }) => {
    await setClientIp(page)
    await page.goto("/admin/login")
    await fillAndSubmit(page, ACCOUNTS.staff.email, "definitely-not-it-123")

    await expect(page.getByTestId("login-message")).toHaveText(
      "Email or password is incorrect."
    )
    await expect(page.getByLabel("Password")).toHaveValue("")
    await expect(page.getByLabel("Password")).toBeFocused()
    await expect(page).toHaveURL(/\/admin\/login$/)
  })

  test("E5: an unknown email reads the same", async ({ page }) => {
    await setClientIp(page)
    await page.goto("/admin/login")
    await fillAndSubmit(page, "nobody@example.test", "definitely-not-it-123")
    await expect(page.getByTestId("login-message")).toHaveText(
      "Email or password is incorrect."
    )
  })

  test("empty fields name what is missing and focus the first", async ({
    page,
  }) => {
    await page.goto("/admin/login")
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page.getByText("Enter your email.")).toBeVisible()
    await expect(page.getByText("Enter your password.")).toBeVisible()
    await expect(page.getByLabel("Email")).toBeFocused()
  })

  test("E6: the fourth sign-in inside ten seconds is rate limited, with the wait", async ({
    page,
  }) => {
    await setClientIp(page)
    await page.goto("/admin/login")
    await page.getByLabel("Email").fill(ACCOUNTS.staff.email)

    for (let attempt = 1; attempt <= 4; attempt++) {
      await page.getByLabel("Password").fill("definitely-not-it-123")
      const answered = page.waitForResponse((response) =>
        response.url().includes("/api/auth/sign-in/email")
      )
      await page.getByRole("button", { name: "Sign in" }).click()
      const response = await answered
      expect(response.status()).toBe(attempt <= 3 ? 401 : 429)
    }
    await expect(page.getByTestId("login-message")).toHaveText(
      /^Too many sign-in attempts\. Wait \d+ seconds? and try again\.$/
    )
  })

  test("a correct password is refused too while limited, and another IP is not", async ({
    browser,
    playwright,
    baseURL,
  }) => {
    // Straight at the endpoint, from one address of its own
    const api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { "x-forwarded-for": newIp(), origin: baseURL! },
    })
    for (let i = 0; i < 3; i++) {
      const wrong = await api.post("/api/auth/sign-in/email", {
        data: {
          email: ACCOUNTS.staff.email,
          password: "definitely-not-it-123",
        },
      })
      expect(wrong.status()).toBe(401)
    }
    const refused = await api.post("/api/auth/sign-in/email", {
      data: { email: ACCOUNTS.staff.email, password: passwordFor("staff") },
    })
    expect(refused.status()).toBe(429)
    await api.dispose()

    // The demo account from another address still gets in
    const { context, page: other } = await signInFresh(browser, "demo")
    await expect(other).toHaveURL(/\/admin\/orders$/)
    await context.close()
  })

  test("E10: next=//evil.com is ignored", async ({ page }) => {
    await setClientIp(page)
    await page.goto("/admin/login?next=//evil.com")
    await fillAndSubmit(page, ACCOUNTS.staff.email, passwordFor("staff"))
    await expect(page).toHaveURL(/\/admin\/orders$/)
    expect(new URL(page.url()).hostname).not.toBe("evil.com")
  })

  test("E11: keyboard only, Tab through the form and Enter signs in", async ({
    page,
  }) => {
    await setClientIp(page)
    await page.goto("/admin/login")
    await page.keyboard.press("Tab")
    await expect(page.getByLabel("Email")).toBeFocused()
    await page.keyboard.type(ACCOUNTS.staff.email)
    await page.keyboard.press("Tab")
    await expect(page.getByLabel("Password")).toBeFocused()
    await page.keyboard.type(passwordFor("staff"))
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/admin\/orders$/)
  })

  test("E12: the form is noindex with no canonical", async ({ page }) => {
    await page.goto("/admin/login")
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/
    )
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
    await expect(page).toHaveTitle("Staff sign in · PC Silicon Admin")
  })

  test("E14: the demo box shows the account, fills the form on request and signs in", async ({
    page,
  }) => {
    await setClientIp(page)
    await page.goto("/admin/login")
    const box = page.getByRole("region", { name: "Demo account" })
    await expect(box).toBeVisible()
    await expect(box).toContainText(ACCOUNTS.demo.email)
    await expect(box).toContainText(passwordFor("demo"))

    await box.getByRole("button", { name: "Use demo account" }).click()
    await expect(page.getByLabel("Email")).toHaveValue(ACCOUNTS.demo.email)
    await expect(page.getByLabel("Password")).toHaveValue(passwordFor("demo"))
    // It fills, it doesn't submit
    await expect(page).toHaveURL(/\/admin\/login$/)

    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL(/\/admin\/orders$/)
    await expect(page.getByTestId("admin-person")).toHaveText(
      `${ACCOUNTS.demo.name} · ${ACCOUNTS.demo.label}`
    )
  })

  test("E16: a sign-in sets an HttpOnly, SameSite=Lax session cookie", async ({
    page,
  }) => {
    await setClientIp(page)
    await page.goto("/admin/login")
    const answered = page.waitForResponse((response) =>
      response.url().includes("/api/auth/sign-in/email")
    )
    await fillAndSubmit(page, ACCOUNTS.staff.email, passwordFor("staff"))
    const response = await answered
    expect(response.status()).toBe(200)
    const cookie = (await response.headersArray())
      .filter((header) => header.name.toLowerCase() === "set-cookie")
      .map((header) => header.value)
      .find((value) => value.includes("session_token"))
    expect(cookie, "a session cookie was set").toBeTruthy()
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toMatch(/SameSite=Lax/i)
    expect(cookie).toContain("Path=/")
    // http://localhost: no Secure flag and no __Secure- prefix, or the browser
    // would drop it. On https the prefix is added (unit and database tests).
    expect(cookie).not.toMatch(/;\s*Secure/i)
    expect(cookie!.startsWith("better-auth.session_token=")).toBe(true)
  })
})

test.describe("staff", () => {
  test.use({ storageState: authFile("staff") })

  test("E3: /admin goes to /admin/orders", async ({ page }) => {
    await page.goto("/admin")
    await expect(page).toHaveURL(/\/admin\/orders$/)
    await expect(
      page.getByRole("heading", { name: "Orders", level: 1 })
    ).toBeVisible()
    await expect(
      page.getByText("The order list comes with the Admin panel.")
    ).toBeVisible()
  })

  test("the shell has the Orders link, the person and Sign out", async ({
    page,
  }) => {
    await page.goto("/admin/orders")
    await expect(
      page.getByRole("link", { name: "Orders", exact: true })
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible()
    await expect(page).toHaveTitle("Orders · PC Silicon Admin")
  })

  test("a signed-in visit to the form goes to /admin/orders", async ({
    page,
  }) => {
    await page.goto("/admin/login")
    await expect(page).toHaveURL(/\/admin\/orders$/)
  })

  test("an unknown admin path is the not-found page inside the shell", async ({
    page,
  }) => {
    const response = await page.goto("/admin/nonsense")
    expect(response?.status()).toBe(404)
    await expect(
      page.getByRole("heading", { name: "Page not found." })
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible()
    await page.getByRole("link", { name: "Go to Orders" }).click()
    await expect(page).toHaveURL(/\/admin\/orders$/)
  })

  test("R8: every admin response is no-store and no-referrer", async ({
    page,
  }) => {
    for (const path of ["/admin/orders", "/admin/nonsense"]) {
      const response = await page.goto(path)
      const headers = response!.headers()
      expect(headers["cache-control"], path).toContain("no-store")
      expect(headers["referrer-policy"], path).toBe("no-referrer")
    }
    const session = await page.request.get("/api/auth/get-session")
    expect(session.headers()["cache-control"]).toContain("no-store")
    expect(session.headers()["referrer-policy"]).toBe("no-referrer")
  })

  test("the admin pages are noindex", async ({ page }) => {
    await page.goto("/admin/orders")
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/
    )
  })
})

test.describe("demo", () => {
  test.use({ storageState: authFile("demo") })

  test("E7: the shell opens and shows no customer, order or price data", async ({
    page,
  }) => {
    await page.goto("/admin/orders")
    await expect(page.getByTestId("admin-person")).toHaveText(
      `${ACCOUNTS.demo.name} · ${ACCOUNTS.demo.label}`
    )
    const text = await page.locator("body").innerText()
    expect(text).not.toMatch(/₱|PCS-[0-9A-Z]{8}/)
    expect(text).not.toMatch(/@example\.com/)
  })
})

test.describe("sessions of their own", () => {
  test("E4: Sign out ends this session, and opening the admin again ends at the form", async ({
    browser,
  }) => {
    const { context, page } = await signInFresh(browser, "staff")
    await expect(page).toHaveURL(/\/admin\/orders$/)

    await page.getByRole("button", { name: "Sign out" }).click()
    await expect(page).toHaveURL(/\/admin\/login$/)

    // Opening the admin again, as Back or a reload would, ends at the form
    await page.goto("/admin/orders")
    await expect(page).toHaveURL(/\/admin\/login/)
    await expect(page.getByLabel("Email")).toBeVisible()
    await context.close()
  })

  test("E15: one demo session signing out leaves the other signed in", async ({
    browser,
  }) => {
    const first = await signInFresh(browser, "demo")
    const second = await signInFresh(browser, "demo")
    await expect(first.page).toHaveURL(/\/admin\/orders$/)
    await expect(second.page).toHaveURL(/\/admin\/orders$/)

    await first.page.getByRole("button", { name: "Sign out" }).click()
    await expect(first.page).toHaveURL(/\/admin\/login$/)

    await second.page.goto("/admin/orders")
    await expect(second.page).toHaveURL(/\/admin\/orders$/)
    await expect(
      second.page.getByRole("heading", { name: "Orders", level: 1 })
    ).toBeVisible()
    await first.context.close()
    await second.context.close()
  })

  test("the old cookie of a signed-out session opens nothing", async ({
    browser,
  }) => {
    const { context, page } = await signInFresh(browser, "staff")
    await expect(page).toHaveURL(/\/admin\/orders$/)
    const cookies = await context.cookies()

    await page.getByRole("button", { name: "Sign out" }).click()
    await expect(page).toHaveURL(/\/admin\/login$/)

    // The same cookie sent again (a copied one, a back-button cache)
    const replay = await browser.newContext({ storageState: signedOut })
    await replay.addCookies(cookies)
    const stale = await replay.newPage()
    await stale.goto("/admin/orders")
    await expect(stale).toHaveURL(/\/admin\/login$/)
    await replay.close()
    await context.close()
  })
})

test.describe("the storefront", () => {
  test.use({ storageState: signedOut })

  test("E8: the sample pages are gone", async ({ page }) => {
    for (const path of ["/login", "/signup", "/sidebar"]) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(404)
    }
  })

  test("E9: the header has no Account icon", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("link", { name: "Account" })).toHaveCount(0)
  })

  test("R9: the sitemap lists nothing under /admin", async ({ request }) => {
    const response = await request.get("/sitemap.xml")
    expect(response.status()).toBe(200)
    expect(await response.text()).not.toContain("/admin")
  })

  test("a missing-account message exists for the setup project", () => {
    expect(MISSING_ACCOUNT("staff")).toBe(
      "The staff account doesn't exist in this database. Create the E2E accounts: see docs/setup/admin-accounts.md."
    )
  })
})
