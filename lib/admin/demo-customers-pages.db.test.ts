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

// docs/specs/042-admin-customers, E20, E21, E22, E23, E31: the customers page,
// the order list followed from a row, and the order detail's customer link,
// rendered as Demo with one fixture customer. Spec 040's shared helper finds
// none of the customer's values in the markup or in the props the page hands
// its view. The same pages are fetched as RSC payloads by
// e2e/admin-customers.spec.ts on the running app.

const role = vi.hoisted(() => ({
  current: "demo" as "demo" | "owner" | "staff",
}))

vi.mock("next/server", () => ({ connection: async () => {} }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  },
}))
vi.mock("@/app/admin/(shell)/orders/[number]/actions", () => ({
  transitionOrderAction: async () => ({ ok: false, message: "unused" }),
  cancelOrderAction: async () => ({ ok: false, message: "unused" }),
}))
vi.mock("@/lib/admin/session", () => ({
  requireAdminAccess: async () => ({
    allowed: true,
    session: { user: { adminRole: role.current } },
  }),
}))

import AdminCustomersPage from "@/app/admin/(shell)/customers/page"
import AdminOrdersPage from "@/app/admin/(shell)/orders/(list)/page"
import AdminOrderDetailPage from "@/app/admin/(shell)/orders/[number]/page"

const NUMBER = "PCS-7K3M9Q2X"
// Place names the order holds and Demo may not see (the region stays)
const RAW = [...FIXTURE_RAW_VALUES, "Alicia", "Quezon City", "Metro Manila"]

beforeEach(async () => {
  role.current = "demo"
  await resetCatalog()
  await db.order.create({
    data: orderData({
      orderNumber: NUMBER,
      guestEmail: FIXTURE_CUSTOMER.email,
      contactName: FIXTURE_CUSTOMER.name,
      contactMobile: FIXTURE_CUSTOMER.mobile,
      street: FIXTURE_CUSTOMER.street,
      createdAt: new Date("2026-11-01T00:00:00Z"),
      expiresAt: new Date(Date.now() + 86_400_000),
    }),
  })
})
afterAll(() => db.$disconnect())

const props = (search: Record<string, string> = {}) =>
  ({ searchParams: Promise.resolve(search) }) as never
const orderProps = () =>
  ({
    params: Promise.resolve({ number: NUMBER }),
    searchParams: Promise.resolve({}),
  }) as never

// What the page sends: the markup, and the props of the element it returns
const sent = (element: React.ReactElement) => ({
  markup: renderToStaticMarkup(element),
  props: JSON.stringify(element.props),
})

describe("Demo sees no customer value on the customer surfaces", () => {
  test("E20: the customers page", async () => {
    const { markup, props: p } = sent(
      (await AdminCustomersPage(props())) as React.ReactElement
    )
    expect(markup).toContain("A••• R•••")
    expect(markup).toContain("buyer=c1")
    expectNoRawValues(markup, RAW)
    expectNoRawValues(p, RAW)
  })

  test("E22: the order list followed from a row", async () => {
    const { markup, props: p } = sent(
      (await AdminOrdersPage(props({ buyer: "c1" }))) as React.ReactElement
    )
    expect(markup).toContain(NUMBER)
    expect(markup).toContain("Orders from A••• R•••")
    expectNoRawValues(markup, RAW)
    expectNoRawValues(p, RAW)
  })

  test("E31: the order detail and its customer link", async () => {
    const { markup, props: p } = sent(
      (await AdminOrderDetailPage(orderProps())) as React.ReactElement
    )
    expect(markup).toContain('href="/admin/orders?buyer=c1"')
    expectNoRawValues(markup, RAW)
    expectNoRawValues(p, RAW)
  })

  test("E21: a customer search shows the refusal and no results", async () => {
    const { markup } = sent(
      (await AdminCustomersPage(
        props({ customer: "reyes" })
      )) as React.ReactElement
    )
    expect(markup).toContain("This account is read-only")
    expect(markup).not.toContain("A••• R•••")
    expectNoRawValues(markup, RAW)
  })

  test("E23: an email as the buyer finds nothing", async () => {
    const { markup } = sent(
      (await AdminOrdersPage(
        props({ buyer: FIXTURE_CUSTOMER.email })
      )) as React.ReactElement
    )
    expect(markup).toContain("Orders from an unknown customer")
    expect(markup).not.toContain(NUMBER)
    expectNoRawValues(markup.replaceAll(/value="[^"]*"/g, ""), RAW)
  })
})

describe("the same pages for Owner and Staff", () => {
  test.each(["owner", "staff"] as const)(
    "%s sees the real values and the email key",
    async (name) => {
      role.current = name
      const customers = sent(
        (await AdminCustomersPage(props())) as React.ReactElement
      ).markup
      expect(customers).toContain("Ana Reyes")
      expect(customers).toContain(FIXTURE_CUSTOMER.email)
      expect(customers).toContain("buyer=ana.reyes%40example.com")
      const detail = sent(
        (await AdminOrderDetailPage(orderProps())) as React.ReactElement
      ).markup
      expect(detail).toContain("buyer=ana.reyes%40example.com")
    }
  )

  test("a canonical redirect and a page past the last", async () => {
    role.current = "owner"
    await expect(AdminCustomersPage(props({ page: "1" }))).rejects.toThrow(
      "NEXT_REDIRECT /admin/customers"
    )
    await expect(AdminCustomersPage(props({ page: "5" }))).rejects.toThrow(
      "NEXT_REDIRECT /admin/customers"
    )
    const empty = (await AdminCustomersPage(
      props({ customer: "zzzzzz", page: "4" })
    )) as React.ReactElement
    expect(sent(empty).markup).toContain("No customers match this search.")
  })
})
