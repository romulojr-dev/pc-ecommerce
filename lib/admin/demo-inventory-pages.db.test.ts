import { renderToStaticMarkup } from "react-dom/server"
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

import { db } from "@/lib/db"
import { makeStaffUser } from "@/test-support/admin-session"
import { insertParts } from "@/test-support/build-fixtures"
import { resetCatalog } from "@/test-support/db"
import {
  expectNoRawValues,
  FIXTURE_CUSTOMER,
  FIXTURE_RAW_VALUES,
} from "@/test-support/no-raw-values"
import { orderData } from "@/test-support/orders"
import { seed } from "@/test-support/seed-parts"

// docs/specs/046-admin-inventory-adjustments, E1, E26, E30, E35, B15: the
// inventory list and a product's page rendered as Demo, Staff and Owner. Demo
// sees every control disabled and every note hidden, and spec 040's shared
// helper finds none of the fixture customer's values or the staff note in the
// markup or in the props the page hands its view. The same pages are fetched
// as RSC payloads by e2e/admin-inventory.spec.ts on the running app.

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
vi.mock("@/app/admin/(shell)/inventory/actions", () => ({
  adjustStockAction: async () => ({ ok: false, message: "unused" }),
  setLowStockAtAction: async () => ({ ok: false, message: "unused" }),
}))
vi.mock("@/lib/admin/session", () => ({
  requireAdminAccess: async () => ({
    allowed: true,
    session: { user: { adminRole: role.current } },
  }),
}))

import AdminInventoryPage from "@/app/admin/(shell)/inventory/(list)/page"
import AdminInventoryProductPage from "@/app/admin/(shell)/inventory/[id]/page"

const NOTE = "Returned from PCS-7K3M9Q2X, box sealed"
const NUMBER = "PCS-7K3M9Q2X"
// The customer's details and the staff note: none may reach Demo
const RAW = [...FIXTURE_RAW_VALUES, "Alicia", "Quezon City", NOTE]

let productId: string

beforeEach(async () => {
  role.current = "demo"
  await resetCatalog()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
  productId = (
    await insertParts([seed.ryzen5_7600], {
      [seed.ryzen5_7600.id]: { stock: 3 },
    })
  ).get(seed.ryzen5_7600.id)!
  const staff = await makeStaffUser("ana.staff@example.org", "STAFF")
  const order = await db.order.create({
    data: orderData({
      orderNumber: NUMBER,
      guestEmail: FIXTURE_CUSTOMER.email,
      contactName: FIXTURE_CUSTOMER.name,
      contactMobile: FIXTURE_CUSTOMER.mobile,
      street: FIXTURE_CUSTOMER.street,
    }),
  })
  await db.stockMovement.createMany({
    data: [
      {
        productId,
        change: -2,
        reason: "ORDER_RESERVED",
        orderId: order.id,
        createdAt: new Date("2026-11-01T01:00:00Z"),
      },
      {
        productId,
        change: 1,
        reason: "CORRECTION",
        actorId: staff.id,
        note: NOTE,
        createdAt: new Date("2026-11-02T01:00:00Z"),
      },
    ],
  })
})
afterAll(() => db.$disconnect())

const listProps = (search: Record<string, string> = {}) =>
  ({ searchParams: Promise.resolve(search) }) as never
const productProps = (id = productId, search: Record<string, string> = {}) =>
  ({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(search),
  }) as never

// The props a page hands its view, as data: element types and owners are code,
// not data, and some of them point back at themselves
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

const sent = (element: React.ReactElement) => ({
  markup: renderToStaticMarkup(element),
  props: dataOf(element.props),
})

describe("as Demo", () => {
  test("E1: the list renders and links to inventory pages", async () => {
    const { markup, props } = sent(
      (await AdminInventoryPage(listProps())) as React.ReactElement
    )
    expect(markup).toContain("AMD Ryzen 5 7600")
    expect(markup).toContain(`/admin/inventory/${productId}`)
    expectNoRawValues(markup, RAW)
    expectNoRawValues(props, RAW)
  })

  test("E30: the product page is read-only, hides the note, keeps the order link", async () => {
    const { markup, props } = sent(
      (await AdminInventoryProductPage(productProps())) as React.ReactElement
    )
    expect(markup).toContain("This account is read-only.")
    expect(markup).not.toContain("Review adjustment")
    expect(markup).not.toContain("Save threshold")
    expect(markup).toContain("<fieldset disabled")
    expect(markup).toContain("Hidden in demo")
    expect(markup).toContain(`/admin/orders/${NUMBER}`)
    expect(markup).toContain("ana.staff@example.org")
    expect(markup).toContain("Changes before 1 Nov 2026 aren&#x27;t recorded.")
    expectNoRawValues(markup, RAW)
    expectNoRawValues(props, RAW)
  })

  test("E35: an unknown or malformed id is a 404", async () => {
    await expect(
      AdminInventoryProductPage(productProps("no-such-product"))
    ).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(
      AdminInventoryProductPage(productProps("../etc"))
    ).rejects.toThrow("NEXT_NOT_FOUND")
  })

  test("E28: a non-canonical or past-the-end page redirects", async () => {
    await expect(
      AdminInventoryProductPage(productProps(productId, { page: "abc" }))
    ).rejects.toThrow(`NEXT_REDIRECT /admin/inventory/${productId}`)
    await expect(
      AdminInventoryProductPage(productProps(productId, { page: "9" }))
    ).rejects.toThrow(`NEXT_REDIRECT /admin/inventory/${productId}`)
    await expect(AdminInventoryPage(listProps({ q: "r" }))).rejects.toThrow(
      "NEXT_REDIRECT /admin/inventory"
    )
  })
})

describe("as Staff and Owner", () => {
  test.each(["staff", "owner"] as const)(
    "%s can adjust and sees the note",
    async (who) => {
      role.current = who
      const { markup } = sent(
        (await AdminInventoryProductPage(productProps())) as React.ReactElement
      )
      expect(markup).toContain("Review adjustment")
      expect(markup).toContain("Save threshold")
      expect(markup).toContain(NOTE)
      expect(markup).not.toContain("Hidden in demo")
      expect(markup).not.toContain("This account is read-only.")
    }
  )

  test("only the Owner and Demo are offered the product edit screen", async () => {
    role.current = "staff"
    const staff = renderToStaticMarkup(
      (await AdminInventoryProductPage(productProps())) as React.ReactElement
    )
    expect(staff).not.toContain("/admin/products")
    role.current = "owner"
    const owner = renderToStaticMarkup(
      (await AdminInventoryProductPage(productProps())) as React.ReactElement
    )
    expect(owner).toContain(`/admin/products/${productId}`)
  })
})
