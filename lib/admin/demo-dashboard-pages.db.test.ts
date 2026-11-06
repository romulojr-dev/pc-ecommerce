import { renderToStaticMarkup } from "react-dom/server"
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

import { db } from "@/lib/db"
import { resetCatalog } from "@/test-support/db"
import {
  expectNoRawValues,
  FIXTURE_CUSTOMER,
  FIXTURE_RAW_VALUES,
} from "@/test-support/no-raw-values"
import { orderData } from "@/test-support/orders"

// docs/specs/048-admin-dashboard, E19, E20, E21: the dashboard rendered as
// Demo, Owner and Staff. Demo sees the real figures and masked recent-order
// names, and spec 040's shared helper finds none of the fixture customer's
// values in the markup or in the props the page hands its views. The page is
// fetched as an RSC payload by e2e/admin-dashboard.spec.ts on the running app.

const role = vi.hoisted(() => ({
  current: "demo" as "demo" | "owner" | "staff",
}))

vi.mock("next/server", () => ({ connection: async () => {} }))
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  },
}))
vi.mock("@/lib/admin/session", () => ({
  requireAdminAccess: async (action: string) => {
    const allowed = role.current !== "staff" || action !== "dashboard.view"
    return { allowed, session: { user: { adminRole: role.current } } }
  },
}))

import AdminDashboardPage from "@/app/admin/(shell)/dashboard/page"

const RAW = [...FIXTURE_RAW_VALUES, "Alicia", "Quezon City"]

beforeEach(async () => {
  role.current = "demo"
  await resetCatalog()
  await db.order.create({
    data: orderData({
      status: "PAID",
      paidAt: new Date(),
      total: 2_311_000,
      guestEmail: FIXTURE_CUSTOMER.email,
      contactName: FIXTURE_CUSTOMER.name,
      contactMobile: FIXTURE_CUSTOMER.mobile,
      street: FIXTURE_CUSTOMER.street,
    }),
  })
})
afterAll(() => db.$disconnect())

// The props a page hands its views, as data: element types and owners are
// code, not data, and some of them point back at themselves
function dataOf(value: unknown): string {
  const seen = new WeakSet<object>()
  return JSON.stringify(value, (key, inner) => {
    if (key === "type" || key === "_owner" || key === "_store") return undefined
    if (inner && typeof inner === "object") {
      if (seen.has(inner)) return undefined
      seen.add(inner)
    }
    return inner
  })
}

async function render() {
  const element = (await AdminDashboardPage()) as React.ReactElement
  return {
    markup: renderToStaticMarkup(element),
    props: dataOf(element.props),
  }
}

describe("the dashboard", () => {
  test("Demo: real figures, masked names, none of the fixture's values (E19)", async () => {
    const { markup, props } = await render()
    expect(markup).toContain("₱23,110.00")
    expect(markup).toContain("Customer details are hidden in the demo.")
    expect(markup).toContain("A••• R•••")
    expectNoRawValues(markup, RAW)
    expectNoRawValues(props, RAW)
  })

  test("Owner sees the whole name and the same figures (E20)", async () => {
    role.current = "owner"
    const { markup } = await render()
    expect(markup).toContain(FIXTURE_CUSTOMER.name)
    expect(markup).toContain("₱23,110.00")
    expect(markup).not.toContain("Customer details are hidden in the demo.")
  })

  test("Staff gets the no-access page and no data (E21)", async () => {
    role.current = "staff"
    const { markup } = await render()
    expect(markup).toContain("You don&#x27;t have access to this page")
    expect(markup).not.toContain("Paid sales")
  })
})
