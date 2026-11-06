import { renderToStaticMarkup } from "react-dom/server"
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

import { db } from "@/lib/db"
import { insertParts, partsOfBuild } from "@/test-support/build-fixtures"
import { resetCatalog } from "@/test-support/db"
import {
  expectNoRawValues,
  FIXTURE_CUSTOMER,
  FIXTURE_PARCEL,
  FIXTURE_RAW_VALUES,
} from "@/test-support/no-raw-values"
import { orderData } from "@/test-support/orders"
import { paymentData } from "@/test-support/payments"
import { buildA } from "@/test-support/seed-parts"

// docs/specs/041-admin-orders-list-detail, E30: the list, the detail and the
// packing slip, rendered as Demo with one fixture order. Spec 040's shared
// helper finds none of the customer's values in the markup or in the props the
// page hands its view. The same pages are fetched as RSC payloads by
// e2e/admin-orders.spec.ts on the running app.

const role = vi.hoisted(() => ({ current: "demo" as "demo" | "owner" }))

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

import AdminOrdersPage from "@/app/admin/(shell)/orders/(list)/page"
import AdminOrderDetailPage from "@/app/admin/(shell)/orders/[number]/page"
import AdminPackingSlipPage from "@/app/admin/(shell)/orders/[number]/packing-slip/page"

const NUMBER = "PCS-7K3M9Q2X"
// Place names the order holds and Demo may not see (the region stays)
const RAW = [...FIXTURE_RAW_VALUES, "Alicia", "Quezon City", "Metro Manila"]

beforeEach(async () => {
  role.current = "demo"
  await resetCatalog()
  const parts = partsOfBuild(buildA())
  const ids = await insertParts(parts)
  const order = await db.order.create({
    data: orderData({
      orderNumber: NUMBER,
      guestEmail: FIXTURE_CUSTOMER.email,
      contactName: FIXTURE_CUSTOMER.name,
      contactMobile: FIXTURE_CUSTOMER.mobile,
      street: FIXTURE_CUSTOMER.street,
      expiresAt: new Date(Date.now() + 86_400_000),
      // shipped, so the parcel is on the detail and the slip (spec 043, E30a)
      status: "SHIPPED",
      paidAt: new Date("2026-11-02T06:10:00Z"),
      shippedAt: new Date("2026-11-02T07:30:00Z"),
      ...FIXTURE_PARCEL,
    }),
  })
  await db.orderItem.create({
    data: {
      orderId: order.id,
      productId: ids.get(parts[0].id)!,
      nameSnapshot: parts[0].name,
      priceSnapshot: 100_000,
      quantity: 1,
      position: 0,
    },
  })
  await db.payment.create({ data: paymentData(order.id) })
  await db.emailOutbox.create({
    data: {
      orderId: order.id,
      type: "ORDER_PLACED",
      recipientHash: "ab".repeat(32),
    },
  })
})
afterAll(() => db.$disconnect())

const listProps = (search: Record<string, string> = {}) =>
  ({ searchParams: Promise.resolve(search) }) as never
const orderProps = () =>
  ({
    params: Promise.resolve({ number: NUMBER }),
    searchParams: Promise.resolve({}),
  }) as never

async function pages() {
  return {
    list: await AdminOrdersPage(listProps()),
    detail: await AdminOrderDetailPage(orderProps()),
    slip: await AdminPackingSlipPage(orderProps()),
  }
}

// What the page sends: the markup, and the props of the element it returns
// (the data its view component is given)
const sent = (element: React.ReactElement) => ({
  markup: renderToStaticMarkup(element),
  props: JSON.stringify(element.props),
})

describe("E30: Demo sees no customer value on any of the three pages", () => {
  test.each(["list", "detail", "slip"] as const)("the %s", async (name) => {
    const element = (await pages())[name] as React.ReactElement
    const { markup, props } = sent(element)
    expect(markup).toContain(NUMBER)
    expectNoRawValues(markup, RAW)
    expectNoRawValues(props, RAW)
  })

  test("control: the same pages as Owner do carry the values", async () => {
    role.current = "owner"
    const { list, detail, slip } = await pages()
    expect(sent(list as React.ReactElement).markup).toContain("Ana Reyes")
    const detailSent = sent(detail as React.ReactElement)
    expect(detailSent.markup).toContain(FIXTURE_PARCEL.trackingNumber)
    expect(detailSent.markup).toContain(FIXTURE_CUSTOMER.email)
    expect(detailSent.markup).toContain(FIXTURE_CUSTOMER.street)
    const slipSent = sent(slip as React.ReactElement)
    expect(slipSent.markup).toContain(FIXTURE_CUSTOMER.mobile)
  })

  test("Demo's customer search shows the refusal and no results", async () => {
    const element = (await AdminOrdersPage(
      listProps({ customer: "reyes" })
    )) as React.ReactElement
    const { markup } = sent(element)
    expect(markup).toContain("This account is read-only")
    expect(markup).not.toContain(NUMBER)
    expectNoRawValues(markup, RAW)
  })

  test("a canonical redirect and a 404 work from the page", async () => {
    await expect(
      AdminOrdersPage(listProps({ status: "bogus" }))
    ).rejects.toThrow("NEXT_REDIRECT /admin/orders")
    await expect(
      AdminOrderDetailPage({
        params: Promise.resolve({ number: "PCS-AAAAAAAA" }),
        searchParams: Promise.resolve({}),
      } as never)
    ).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(
      AdminPackingSlipPage({
        params: Promise.resolve({ number: "not-an-order" }),
      } as never)
    ).rejects.toThrow("NEXT_NOT_FOUND")
  })

  test("a page past the last redirects to the last, an empty filter does not", async () => {
    await expect(AdminOrdersPage(listProps({ page: "5" }))).rejects.toThrow(
      "NEXT_REDIRECT /admin/orders"
    )
    const empty = (await AdminOrdersPage(
      listProps({ status: "REFUNDED", page: "4" })
    )) as React.ReactElement
    expect(sent(empty).markup).toContain("No orders match these filters.")
  })
})
