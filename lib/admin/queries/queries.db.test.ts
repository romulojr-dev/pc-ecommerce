import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterAll, beforeEach, describe, expect, test } from "vitest"

import { db } from "@/lib/db"
import { makeStaffUser, resetSignInIps } from "@/test-support/admin-session"
import { resetCatalog } from "@/test-support/db"
import {
  expectNoRawValues,
  FIXTURE_CUSTOMER,
  FIXTURE_RAW_VALUES,
} from "@/test-support/no-raw-values"
import { orderData, pickupOrderData } from "@/test-support/orders"

import { adminTransaction, recordAudit } from "../audit"
import type { OrderPersonView } from "./orders"
import { listAuditEntries } from "./audit"
import { listCustomers } from "./customers"
import { QueryDeniedError } from "./guard"
import { getOrderPerson, searchOrders } from "./orders"

// docs/specs/040-admin-permissions-audit-masking, T11: E11 to E15 through the
// real query layer

const NUMBER = "PCS-7K3M9Q2X"

beforeEach(async () => {
  resetSignInIps()
  await resetCatalog()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
  await db.order.create({
    data: orderData({
      orderNumber: NUMBER,
      guestEmail: FIXTURE_CUSTOMER.email,
      contactName: FIXTURE_CUSTOMER.name,
      contactMobile: FIXTURE_CUSTOMER.mobile,
      street: FIXTURE_CUSTOMER.street,
    }),
  })
})
afterAll(() => db.$disconnect())

// A stand-in for a page: draws the view the way a component would, and the
// props it would hand a client component
function renderPage(order: OrderPersonView) {
  const { contact, address } = order
  const place =
    address.kind === "pickup"
      ? "Store pickup"
      : `${address.regionName} ${address.masked ? "" : address.street}`
  return renderToStaticMarkup(
    createElement(
      "section",
      null,
      createElement("h1", null, order.orderNumber),
      createElement("p", null, contact.name),
      createElement("p", null, contact.email),
      createElement("p", null, contact.mobile),
      createElement("p", null, place)
    )
  )
}

describe("an order as a role sees it", () => {
  test("Owner sees the real values (E11)", async () => {
    const order = await getOrderPerson("owner", NUMBER)
    expect(order?.contact).toEqual({
      masked: false,
      name: "Ana Reyes",
      email: "ana.reyes@example.com",
      mobile: "+639171234567",
    })
    expect(order?.address).toMatchObject({ street: "12 Mabini St" })
  })

  test("Demo gets masks, and nothing real in the DTO or the markup (E11, E14)", async () => {
    const order = await getOrderPerson("demo", NUMBER)
    expect(order?.contact).toEqual({
      masked: true,
      name: "A••• R•••",
      email: "a•••@••••.•••",
      mobile: "+63•••••••••",
    })
    expect(order?.address).toEqual({
      kind: "delivery",
      masked: true,
      regionName: "National Capital Region (NCR)",
      zone: "METRO_MANILA",
    })
    expectNoRawValues(order, FIXTURE_RAW_VALUES)
    expectNoRawValues(renderPage(order!), FIXTURE_RAW_VALUES)
  })

  test("the helper does catch a leak", async () => {
    const owner = await getOrderPerson("owner", NUMBER)
    expect(() => expectNoRawValues(owner, FIXTURE_RAW_VALUES)).toThrow()
    expect(() =>
      expectNoRawValues(renderPage(owner!), FIXTURE_RAW_VALUES)
    ).toThrow()
  })

  test("a pickup order for Demo (E12)", async () => {
    await db.order.create({
      data: pickupOrderData({
        orderNumber: "PCS-PICKUP01",
        guestEmail: "pick@example.com",
      }),
    })
    const order = await getOrderPerson("demo", "PCS-PICKUP01")
    expect(order?.address).toEqual({ kind: "pickup" })
    expect(order?.contact.masked).toBe(true)
  })

  test("an unknown order is null", async () => {
    expect(await getOrderPerson("demo", "PCS-NOPE0000")).toBeNull()
  })
})

describe("searching orders", () => {
  test("Demo cannot search by customer, and no query runs (E13)", async () => {
    const result = await searchOrders("demo", {
      customer: "ana.reyes@example.com",
    })
    expect(result).toEqual({
      ok: false,
      error: "forbidden",
      message: "This account is read-only",
    })
    // Not even a name fragment or a mobile
    for (const customer of ["Reyes", "+639171234567", "ana"]) {
      expect(await searchOrders("demo", { customer })).toMatchObject({
        ok: false,
      })
    }
  })

  test("Demo can search by order number, with masked results", async () => {
    const result = await searchOrders("demo", { orderNumber: "7K3M9Q" })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.orders.map((o) => o.orderNumber)).toEqual([NUMBER])
      expectNoRawValues(result, FIXTURE_RAW_VALUES)
    }
  })

  test("Owner and Staff can search by customer", async () => {
    for (const role of ["owner", "staff"] as const) {
      const result = await searchOrders(role, { customer: "reyes" })
      expect(result.ok && result.orders.map((o) => o.orderNumber)).toEqual([
        NUMBER,
      ])
    }
  })
})

describe("customers", () => {
  test("Demo rows are masked and keyed by position, not by email (R17)", async () => {
    await db.order.create({
      data: orderData({ guestEmail: "Ana.Reyes@Example.com" }),
    })
    const owner = await listCustomers("owner")
    expect(owner).toHaveLength(1)
    expect(owner[0]).toMatchObject({
      id: "ana.reyes@example.com",
      orderCount: 2,
    })

    const demo = await listCustomers("demo")
    expect(demo).toHaveLength(1)
    expect(demo[0].id).toBe("c1")
    expect(demo[0].contact.masked).toBe(true)
    expectNoRawValues(demo, FIXTURE_RAW_VALUES)
  })
})

describe("audit entries", () => {
  test("Demo sees masked before and after and the actor without an email (E15)", async () => {
    const actor = await makeStaffUser("owner@example.com", "OWNER")
    await adminTransaction((tx) =>
      recordAudit(tx, {
        actorId: actor.id,
        entity: "order",
        entityId: "o1",
        action: "updated",
        before: { contactMobile: "+639170000000" },
        after: {
          contactMobile: FIXTURE_CUSTOMER.mobile,
          note: FIXTURE_CUSTOMER.note,
          status: "PROCESSING",
        },
      })
    )
    const [demo] = await listAuditEntries("demo")
    expect(demo.after).toEqual({
      contactMobile: "+63•••••••••",
      note: "Hidden in demo",
      status: "PROCESSING",
    })
    expect(demo.actor).toEqual({ name: "owner@example.com", role: "OWNER" })
    expectNoRawValues(demo, [
      FIXTURE_CUSTOMER.mobile,
      FIXTURE_CUSTOMER.note,
      "9170000000",
    ])

    const [owner] = await listAuditEntries("owner")
    expect(owner.after).toMatchObject({
      contactMobile: FIXTURE_CUSTOMER.mobile,
    })
  })
})

describe("the view actions are checked again in the query", () => {
  test("Staff has no audit.view; a role without the action throws", async () => {
    await expect(listAuditEntries("staff")).rejects.toThrow(QueryDeniedError)
  })
})
