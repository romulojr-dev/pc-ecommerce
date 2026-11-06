import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

import { insertParts } from "@/test-support/build-fixtures"
import { makeStaffUser, resetSignInIps } from "@/test-support/admin-session"
import { db, resetCatalog } from "@/test-support/db"
import {
  expectNoRawValues,
  FIXTURE_CUSTOMER,
} from "@/test-support/no-raw-values"
import { orderData } from "@/test-support/orders"
import { seed } from "@/test-support/seed-parts"

import {
  AUDIT_PAGE_SIZE,
  type AuditParams,
  DEFAULT_AUDIT_PARAMS,
} from "../audit-params"
import { listAuditPage } from "./audit"
import { QueryDeniedError } from "./guard"

// docs/specs/047-admin-audit-log-view: the paginated, filterable query
// (E1 to E11, E15 to E20, E23). Rows are inserted directly: INSERT is allowed
// on AuditLog (only UPDATE and DELETE are refused), so the tests choose their
// own times.

let ownerId: string
let staffId: string

type Row = {
  actorId?: string
  entity?: string
  entityId?: string
  action?: string
  before?: unknown
  after?: unknown
  createdAt: string
  id?: string
}

async function insertAudit(row: Row) {
  await db.$executeRaw`
    INSERT INTO "AuditLog" ("id","actorId","entity","entityId","action","before","after","createdAt")
    VALUES (${row.id ?? randomUUID()}, ${row.actorId ?? ownerId}, ${row.entity ?? "product"},
      ${row.entityId ?? "p-x"}, ${row.action ?? "updated"},
      ${row.before === undefined ? null : JSON.stringify(row.before)}::jsonb,
      ${row.after === undefined ? null : JSON.stringify(row.after)}::jsonb,
      ${row.createdAt}::timestamptz)`
}

const params = (over: Partial<AuditParams> = {}): AuditParams => ({
  ...DEFAULT_AUDIT_PARAMS,
  ...over,
})

beforeEach(async () => {
  resetSignInIps()
  await resetCatalog()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
  ownerId = (await makeStaffUser("owner@example.com", "OWNER")).id
  staffId = (await makeStaffUser("staff@example.com", "STAFF")).id
})
afterAll(() => db.$disconnect())

describe("order and paging", () => {
  test("E1, E2: newest first, id tiebreak, no repeat or skip across pages", async () => {
    for (let i = 0; i < 60; i++) {
      // Rows 0 and 1 share an instant
      const minute = String(Math.max(i - 1, 0)).padStart(2, "0")
      await insertAudit({
        id: `row-${String(i).padStart(2, "0")}`,
        createdAt: `2026-11-05T10:${minute}:00Z`,
      })
    }
    const seen: string[] = []
    const first = await listAuditPage("owner", params())
    expect(first.total).toBe(60)
    expect(first.pageCount).toBe(3)
    for (let page = 1; page <= 3; page++) {
      const result = await listAuditPage("owner", params({ page }))
      expect(result.entries.length).toBe(page < 3 ? AUDIT_PAGE_SIZE : 10)
      seen.push(...result.entries.map((e) => e.id))
    }
    expect(new Set(seen).size).toBe(60)
    // Newest first; the two rows sharing an instant run by id, descending
    expect(seen[0]).toBe("row-59")
    const tail = seen.slice(-2)
    expect(tail).toEqual(["row-01", "row-00"])
  })

  test("E10, E11: a page past the last lands on the last; no match is page 1", async () => {
    await insertAudit({ createdAt: "2026-11-05T10:00:00Z" })
    expect((await listAuditPage("owner", params({ page: 99 }))).page).toBe(1)
    const none = await listAuditPage("owner", params({ entity: "voucher" }))
    expect(none).toMatchObject({ total: 0, page: 1, pageCount: 1, entries: [] })
  })
})

describe("filters", () => {
  test("E3: by entity", async () => {
    await insertAudit({ entity: "order", createdAt: "2026-11-05T10:00:00Z" })
    await insertAudit({ entity: "product", createdAt: "2026-11-05T10:01:00Z" })
    const page = await listAuditPage("owner", params({ entity: "order" }))
    expect(page.entries.map((e) => e.entity)).toEqual(["order"])
  })

  test("E5, D15: by actor; the list holds users with rows, disabled included", async () => {
    await insertAudit({ actorId: ownerId, createdAt: "2026-11-05T10:00:00Z" })
    await insertAudit({ actorId: staffId, createdAt: "2026-11-05T10:01:00Z" })
    await makeStaffUser("idle@example.com", "STAFF") // no rows: not listed
    await db.user.update({
      where: { id: staffId },
      data: { disabledAt: new Date() },
    })
    const page = await listAuditPage("owner", params({ actor: staffId }))
    expect(page.entries.map((e) => e.actor.name)).toEqual(["staff@example.com"])
    expect(page.actors.map((a) => a.name).sort()).toEqual([
      "owner@example.com",
      "staff@example.com",
    ])
    expect(page.unknownActor).toBe(false)
  })

  test("an unknown actor is ignored and flagged", async () => {
    await insertAudit({ createdAt: "2026-11-05T10:00:00Z" })
    const page = await listAuditPage("owner", params({ actor: "nobody" }))
    expect(page.unknownActor).toBe(true)
    expect(page.total).toBe(1)
  })

  test("E6, E7, E7b: Manila days, both bounds inclusive", async () => {
    const times: Record<string, string> = {
      before: "2026-11-04T23:59:59.999+08:00",
      startOfDay: "2026-11-05T00:00:00.000+08:00",
      lateEvening: "2026-11-05T23:30:00+08:00",
      lastSecond: "2026-11-05T23:59:59+08:00",
      lastMilli: "2026-11-05T23:59:59.999+08:00",
      nextDay: "2026-11-06T00:00:00.000+08:00",
    }
    for (const [id, at] of Object.entries(times)) {
      await insertAudit({ id, createdAt: at })
    }
    const ids = async (over: Partial<AuditParams>) =>
      (await listAuditPage("owner", params(over))).entries
        .map((e) => e.id)
        .sort()
    expect(await ids({ from: "2026-11-05", to: "2026-11-05" })).toEqual([
      "lastMilli",
      "lastSecond",
      "lateEvening",
      "startOfDay",
    ])
    expect(await ids({ from: "2026-11-05" })).toEqual([
      "lastMilli",
      "lastSecond",
      "lateEvening",
      "nextDay",
      "startOfDay",
    ])
    expect(await ids({ to: "2026-11-04" })).toEqual(["before"])
  })

  test("filters combine", async () => {
    await insertAudit({
      entity: "order",
      actorId: staffId,
      createdAt: "2026-11-05T10:00:00+08:00",
    })
    await insertAudit({
      entity: "order",
      actorId: ownerId,
      createdAt: "2026-11-05T10:00:00+08:00",
    })
    const page = await listAuditPage(
      "owner",
      params({
        entity: "order",
        actor: staffId,
        from: "2026-11-05",
        to: "2026-11-05",
      })
    )
    expect(page.total).toBe(1)
  })
})

describe("targets", () => {
  test("E15, E19, E20: order number, product name, plain ids, batched lookups", async () => {
    const order = await db.order.create({
      data: orderData({ orderNumber: "PCS-AUDT0001" }),
    })
    const productId = (await insertParts([seed.ryzen5_7600])).get(
      seed.ryzen5_7600.id
    )!
    await insertAudit({
      entity: "order",
      entityId: order.id,
      action: "status-changed",
      before: { status: "PAID" },
      after: { status: "PROCESSING" },
      createdAt: "2026-11-05T10:00:00Z",
    })
    await insertAudit({
      entity: "product",
      entityId: productId,
      before: { price: 1299900 },
      after: { price: 1199900 },
      createdAt: "2026-11-05T10:01:00Z",
    })
    await insertAudit({
      entity: "voucher",
      entityId: "v1",
      createdAt: "2026-11-05T10:02:00Z",
    })
    await insertAudit({
      entity: "product",
      entityId: "gone",
      createdAt: "2026-11-05T10:03:00Z",
    })

    const orderSpy = vi.spyOn(db.order, "findMany")
    const productSpy = vi.spyOn(db.product, "findMany")
    const { entries } = await listAuditPage("owner", params())
    expect(orderSpy).toHaveBeenCalledTimes(1)
    expect(productSpy).toHaveBeenCalledTimes(1)
    orderSpy.mockRestore()
    productSpy.mockRestore()

    const [gone, voucher, product, orderEntry] = entries
    expect(gone.target).toEqual({ label: "gone", href: null })
    expect(voucher.target).toEqual({ label: "v1", href: null })
    expect(product.target.href).toBe(`/admin/products/${productId}`)
    expect(product.changes[0]).toMatchObject({
      label: "Price",
      before: "₱12,999.00",
      after: "₱11,999.00",
    })
    expect(orderEntry.target).toEqual({
      label: "PCS-AUDT0001",
      href: "/admin/orders/PCS-AUDT0001",
    })
    expect(orderEntry.changes[0]).toMatchObject({
      before: "Paid",
      after: "Processing",
    })
  })
})

describe("roles", () => {
  test("E21: Staff is refused before any read", async () => {
    const spy = vi.spyOn(db.auditLog, "findMany")
    await expect(listAuditPage("staff", params())).rejects.toThrow(
      QueryDeniedError
    )
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  test("E16 to E18, E23: Demo gets masked text and never a raw value", async () => {
    await insertAudit({
      entity: "order",
      entityId: "o1",
      action: "cancelled",
      before: { status: "PROCESSING", contactName: FIXTURE_CUSTOMER.name },
      after: {
        status: "CANCELLED",
        note: FIXTURE_CUSTOMER.note,
        trackingNumber: "JT1234567890",
        contactName: "Alma Rios",
        guestEmail: FIXTURE_CUSTOMER.email,
      },
      createdAt: "2026-11-05T10:00:00Z",
    })
    const demo = await listAuditPage("demo", params())
    const by = Object.fromEntries(
      demo.entries[0].changes.map((c) => [c.path, c])
    )
    expect(by.note.after).toBe("Hidden in demo")
    expect(by.trackingNumber.after).toBe("•••• 7890")
    expect(by.contactName.looksUnchanged).toBe(true)
    expect(by.guestEmail.after).toBe("a•••@••••.•••")
    expect(by.status).toMatchObject({
      before: "Processing",
      after: "Cancelled",
    })
    expectNoRawValues(demo, [
      FIXTURE_CUSTOMER.name,
      "Alma Rios",
      FIXTURE_CUSTOMER.note,
      FIXTURE_CUSTOMER.email,
      "JT1234567890",
    ])
    // The actor is name and role only: no email field exists on the entry
    expect(Object.keys(demo.entries[0].actor).sort()).toEqual(["name", "role"])
    expect(Object.keys(demo.actors[0]).sort()).toEqual(["id", "name", "role"])

    const owner = await listAuditPage("owner", params())
    const ownerBy = Object.fromEntries(
      owner.entries[0].changes.map((c) => [c.path, c])
    )
    expect(ownerBy.note.after).toBe(FIXTURE_CUSTOMER.note)
    expect(ownerBy.trackingNumber.after).toBe("JT1234567890")
  })
})
