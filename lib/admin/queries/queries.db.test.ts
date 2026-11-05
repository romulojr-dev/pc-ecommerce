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
import type { OrderDetail } from "./orders"
import { listAuditEntries } from "./audit"
import { QueryDeniedError } from "./guard"
import { getOrderDetail } from "./orders"

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
function renderPage(order: OrderDetail) {
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
    const order = await getOrderDetail("owner", NUMBER, new Date())
    expect(order?.contact).toEqual({
      masked: false,
      name: "Ana Reyes",
      email: "ana.reyes@example.com",
      mobile: "+639171234567",
    })
    expect(order?.address).toMatchObject({ street: "12 Mabini St" })
  })

  test("Demo gets masks, and nothing real in the DTO or the markup (E11, E14)", async () => {
    const order = await getOrderDetail("demo", NUMBER, new Date())
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
    const owner = await getOrderDetail("owner", NUMBER, new Date())
    expect(() => expectNoRawValues(owner, FIXTURE_RAW_VALUES)).toThrow()
    expect(() =>
      expectNoRawValues(renderPage(owner!), FIXTURE_RAW_VALUES)
    ).toThrow()
  })

  test("a pickup order for Demo (E12)", async () => {
    await db.order.create({
      data: pickupOrderData({
        orderNumber: "PCS-PCKP0001",
        guestEmail: "pick@example.com",
      }),
    })
    const order = await getOrderDetail("demo", "PCS-PCKP0001", new Date())
    expect(order?.address).toEqual({ kind: "pickup" })
    expect(order?.contact.masked).toBe(true)
  })

  test("an unknown order is null", async () => {
    expect(await getOrderDetail("demo", "PCS-NOPE0000", new Date())).toBeNull()
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
