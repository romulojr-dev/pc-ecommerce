import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { disabledReason } from "@/lib/admin/denial"
import { navItemsFor } from "@/lib/admin/nav"

import { AdminShell } from "./admin-shell"
import { NoAccess } from "./no-access"

// docs/specs/040-admin-permissions-audit-masking, T10, Behavior 2 to 4

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/orders",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock("@/lib/auth/client", () => ({ authClient: { signOut: vi.fn() } }))

function shell(adminRole: "owner" | "staff" | "demo") {
  return renderToStaticMarkup(
    <AdminShell
      user={{
        id: "u1",
        name: "Ana",
        email: "ana@example.com",
        role: adminRole.toUpperCase() as "OWNER" | "STAFF" | "DEMO",
        adminRole,
      }}
    >
      <p>page</p>
    </AdminShell>
  )
}

describe("the nav follows can()", () => {
  it("Owner and Demo see Products first; Staff has no Products item", () => {
    for (const role of ["owner", "demo"] as const) {
      expect(navItemsFor(role).map((item) => item.href)).toEqual([
        "/admin/products",
        "/admin/orders",
        "/admin/customers",
      ])
    }
    expect(navItemsFor("staff").map((item) => item.href)).toEqual([
      "/admin/orders",
      "/admin/customers",
    ])
  })
})

describe("the shell", () => {
  it("shows the Demo notice to Demo only", () => {
    expect(shell("demo")).toContain("Demo: customer details are hidden")
    expect(shell("owner")).not.toContain("customer details are hidden")
    expect(shell("staff")).not.toContain("customer details are hidden")
  })

  it("shows the Orders link", () => {
    expect(shell("staff")).toContain("/admin/orders")
  })
})

describe("denial texts on disabled controls", () => {
  it("match the server's", () => {
    expect(disabledReason("demo", "orders.cancel")).toBe(
      "This account is read-only"
    )
    expect(disabledReason("staff", "products.write")).toBe(
      "Only owners can do this"
    )
    expect(disabledReason("staff", "orders.cancel")).toBeNull()
    expect(disabledReason("owner", "products.write")).toBeNull()
  })
})

describe("the no-access page", () => {
  it("says so and links back to Orders", () => {
    const html = renderToStaticMarkup(<NoAccess />)
    expect(html).toContain("have access to this page")
    expect(html).toContain('href="/admin/orders"')
    expect(html).toContain("Back to orders")
  })
})
