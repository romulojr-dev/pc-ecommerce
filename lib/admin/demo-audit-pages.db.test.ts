import { randomUUID } from "node:crypto"

import { renderToStaticMarkup } from "react-dom/server"
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

import { db } from "@/lib/db"
import { makeStaffUser } from "@/test-support/admin-session"
import { resetCatalog } from "@/test-support/db"
import {
  expectNoRawValues,
  FIXTURE_CUSTOMER,
  FIXTURE_RAW_VALUES,
} from "@/test-support/no-raw-values"

// docs/specs/047-admin-audit-log-view, E16 to E18, E21, E23, B1, B11: the
// audit page rendered as Demo, Staff and Owner. Demo gets masked text and spec
// 040's shared helper finds none of the fixture customer's values in the
// markup or in the props the page hands its view. The same page is fetched as
// HTML and as an RSC payload by e2e/admin-audit.spec.ts on the running app.

const role = vi.hoisted(() => ({
  current: "demo" as "demo" | "owner" | "staff",
}))

vi.mock("next/server", () => ({ connection: async () => {} }))
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  },
}))
vi.mock("@/lib/admin/session", async () => {
  const { can } = await import("@/lib/admin/permissions")
  return {
    requireAdminAccess: async (action: string) => ({
      allowed: can(role.current, action),
      session: { user: { adminRole: role.current } },
    }),
  }
})

import AdminAuditPage from "@/app/admin/(shell)/audit/(list)/page"

const NOTE = "Leave with the guard, gate 4"
const RAW = [...FIXTURE_RAW_VALUES, "Alma Rios", NOTE, "JT1234567890"]

beforeEach(async () => {
  role.current = "demo"
  await resetCatalog()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
  const owner = await makeStaffUser("owner@example.org", "OWNER")
  await db.$executeRaw`
    INSERT INTO "AuditLog" ("id","actorId","entity","entityId","action","before","after","createdAt")
    VALUES (${randomUUID()}, ${owner.id}, 'order', 'o1', 'cancelled',
      ${JSON.stringify({ status: "PROCESSING", contactName: FIXTURE_CUSTOMER.name })}::jsonb,
      ${JSON.stringify({
        status: "CANCELLED",
        note: NOTE,
        trackingNumber: "JT1234567890",
        contactName: "Alma Rios",
        guestEmail: FIXTURE_CUSTOMER.email,
        contactMobile: FIXTURE_CUSTOMER.mobile,
        street: FIXTURE_CUSTOMER.street,
      })}::jsonb,
      '2026-11-05T10:00:00Z'::timestamptz)`
})
afterAll(() => db.$disconnect())

const props = (search: Record<string, string> = {}) =>
  ({ searchParams: Promise.resolve(search) }) as never

// The props a page hands its view, as data (see demo-inventory-pages)
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
  test("E23: masked changes, no raw value in the markup or the props", async () => {
    const { markup, props: sentProps } = sent(
      (await AdminAuditPage(props())) as React.ReactElement
    )
    expect(markup).toContain("Order · Cancelled")
    expect(markup).toContain("Hidden in demo")
    expect(markup).toContain("•••• 7890")
    expect(markup).toContain("Changed")
    expect(markup).toContain("Customer details are hidden in the demo.")
    expectNoRawValues(markup, RAW)
    expectNoRawValues(sentProps, RAW)
  })
})

describe("as Owner", () => {
  test("sees the real values", async () => {
    role.current = "owner"
    const { markup } = sent(
      (await AdminAuditPage(props())) as React.ReactElement
    )
    expect(markup).toContain(NOTE)
    expect(markup).toContain("JT1234567890")
    expect(markup).not.toContain("Customer details are hidden in the demo.")
  })
})

describe("as Staff", () => {
  test("E21: no access, and no audit read", async () => {
    role.current = "staff"
    const spy = vi.spyOn(db.auditLog, "findMany")
    const element = (await AdminAuditPage(props())) as React.ReactElement
    expect(renderToStaticMarkup(element)).toContain(
      "You don&#x27;t have access to this page"
    )
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe("URL state", () => {
  test("a non-canonical URL redirects; a past-the-end page lands on the last", async () => {
    role.current = "owner"
    await expect(AdminAuditPage(props({ entity: "widget" }))).rejects.toThrow(
      "NEXT_REDIRECT /admin/audit"
    )
    await expect(AdminAuditPage(props({ page: "9" }))).rejects.toThrow(
      "NEXT_REDIRECT /admin/audit"
    )
    await expect(AdminAuditPage(props({ actor: "nobody" }))).rejects.toThrow(
      "NEXT_REDIRECT /admin/audit"
    )
  })

  test("E8: From after To keeps its URL and shows the notice", async () => {
    role.current = "owner"
    const { markup } = sent(
      (await AdminAuditPage(
        props({ from: "2026-11-09", to: "2026-11-01" })
      )) as React.ReactElement
    )
    expect(markup).toContain(
      "The start date was after the end date, so the dates were cleared."
    )
  })
})
