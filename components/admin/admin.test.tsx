import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { LoginFormView, type LoginFormViewProps } from "./login-form"

// docs/specs/039-staff-sign-in-admin-shell: the sign-in form's states as
// markup (Rule 31, I30) and the sample pages' removal (R10–R12). The requests,
// focus and redirects are the form's and covered by the E2E.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/orders",
}))

const base: LoginFormViewProps = {
  email: "",
  password: "",
  fieldErrors: {},
  message: null,
  busy: false,
  demo: null,
  onEmailChange: () => {},
  onPasswordChange: () => {},
  onSubmit: () => {},
  onUseDemo: () => {},
}

const render = (props: Partial<LoginFormViewProps> = {}) =>
  renderToStaticMarkup(<LoginFormView {...base} {...props} />)

describe("LoginFormView", () => {
  it("idle: the heading, two labelled fields and Sign in", () => {
    const html = render()
    expect(html).toContain("Staff sign in")
    expect(html).toContain("PC Silicon admin.")
    expect(html).toMatch(/<label[^>]*for="admin-email"[^>]*>Email<\/label>/)
    expect(html).toMatch(
      /<label[^>]*for="admin-password"[^>]*>Password<\/label>/
    )
    expect(html).toContain('type="password"')
    expect(html).toContain("Sign in")
    expect(html).not.toContain("Demo account")
  })

  it("has the live region in the page even with no message", () => {
    const html = render()
    expect(html).toMatch(
      /aria-live="assertive"[^>]*data-testid="login-message"/
    )
  })

  it("busy: the button reads Signing in…, is disabled, and the fields are too", () => {
    const html = render({ busy: true })
    expect(html).toContain("Signing in…")
    expect(html).toMatch(/<button[^>]*disabled[^>]*>/)
    expect(html).toContain('aria-busy="true"')
    expect(html.match(/disabled/g)!.length).toBeGreaterThanOrEqual(3)
  })

  it("the message goes in the live region", () => {
    const html = render({ message: "Email or password is incorrect." })
    expect(html).toMatch(
      /aria-live="assertive"[^>]*>Email or password is incorrect\.<\/div>/
    )
  })

  it("rate limited: the seconds are in the message", () => {
    const html = render({
      message: "Too many sign-in attempts. Wait 7 seconds and try again.",
    })
    expect(html).toContain("Wait 7 seconds and try again.")
  })

  it("field errors: text, aria-invalid and a description link", () => {
    const html = render({
      fieldErrors: {
        email: "Enter your email.",
        password: "Enter your password.",
      },
    })
    expect(html).toContain("Enter your email.")
    expect(html).toContain("Enter your password.")
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('aria-describedby="admin-email-error"')
    expect(html).toContain('id="admin-password-error"')
  })

  it("keeps what was typed, but a password only in the field's value", () => {
    const html = render({ email: "ana@example.com" })
    expect(html).toContain('value="ana@example.com"')
  })

  it("the demo box lists the email and password as text, with a button (I30)", () => {
    const html = render({
      demo: {
        email: "demo@pcsilicon.tech",
        password: "a-public-demo-password",
      },
    })
    expect(html).toContain("Demo account")
    expect(html).toContain(
      "Reviewers can look around Admin with this account. It can&#x27;t change anything."
    )
    expect(html).toContain("demo@pcsilicon.tech")
    expect(html).toContain("a-public-demo-password")
    expect(html).toMatch(
      /<button[^>]*type="button"[^>]*>Use demo account<\/button>/
    )
  })

  it("the demo password is not in the sign-in fields until the button is used", () => {
    const html = render({
      demo: {
        email: "demo@pcsilicon.tech",
        password: "a-public-demo-password",
      },
    })
    expect(html).not.toMatch(/<input[^>]*value="a-public-demo-password"/)
  })
})

describe("the sample pages are gone (R10–R12)", () => {
  const root = process.cwd()

  it("no login, signup or sidebar route in app/", () => {
    for (const folder of ["login", "signup", "sidebar"]) {
      expect(existsSync(join(root, "app", folder)), folder).toBe(false)
    }
  })

  it("no sample component is left", () => {
    for (const file of [
      "login-form",
      "signup-form",
      "team-switcher",
      "app-sidebar",
      "nav-main",
      "nav-projects",
      "nav-user",
    ]) {
      expect(existsSync(join(root, "components", `${file}.tsx`)), file).toBe(
        false
      )
    }
  })

  it("the storefront header has no Account link", () => {
    const header = readFileSync(
      join(root, "components", "layout", "site-header.tsx"),
      "utf8"
    )
    expect(header).not.toContain("Account")
    expect(header).not.toContain('"/login"')
  })
})
