import { afterAll, beforeEach, describe, expect, test } from "vitest"

import { db } from "@/lib/db"
import { resetCatalog } from "@/test-support/db"
import {
  expectNoRawValues,
  FIXTURE_CUSTOMER,
  FIXTURE_RAW_VALUES,
} from "@/test-support/no-raw-values"
import { orderData } from "@/test-support/orders"

import { getOrderDetail } from "./orders"

// docs/specs/042-admin-customers: E30, E31 and B15 through the real query layer

const NOW = new Date("2026-11-02T08:00:00Z")
const ANA = "PCS-ANA00001"

afterAll(() => db.$disconnect())
beforeEach(async () => {
  await resetCatalog()
  await db.order.create({
    data: orderData({
      orderNumber: ANA,
      guestEmail: FIXTURE_CUSTOMER.email,
      contactName: FIXTURE_CUSTOMER.name,
      contactMobile: FIXTURE_CUSTOMER.mobile,
      street: FIXTURE_CUSTOMER.street,
      createdAt: new Date("2026-11-01T00:00:00Z"),
    }),
  })
  await db.order.create({
    data: orderData({
      orderNumber: "PCS-BEN00001",
      guestEmail: "ben.cruz@example.com",
      contactName: "Ben Cruz",
      createdAt: new Date("2026-11-01T01:00:00Z"),
    }),
  })
})

describe("the link from an order to its customer", () => {
  test("E30: Owner and Staff get the normalized email", async () => {
    await db.order.update({
      where: { orderNumber: ANA },
      data: { guestEmail: " Ana.Reyes+shop@Example.com " },
    })
    for (const role of ["owner", "staff"] as const) {
      const detail = await getOrderDetail(role, ANA, NOW)
      expect(detail?.customerKey).toBe("ana.reyes@example.com")
    }
  })

  test("E31: Demo gets the customer's rank key and the email appears nowhere", async () => {
    const detail = await getOrderDetail("demo", ANA, NOW)
    // Ben ordered more recently, so Ana is the second customer
    expect(detail?.customerKey).toBe("c2")
    expectNoRawValues(detail, FIXTURE_RAW_VALUES)
    expectNoRawValues(detail, ["ana.reyes@example.com", "ben.cruz"])
    expect(
      (await getOrderDetail("demo", "PCS-BEN00001", NOW))?.customerKey
    ).toBe("c1")
  })
})
