import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

import { db } from "@/lib/db"
import { insertParts, partsOfBuild } from "@/test-support/build-fixtures"
import { resetCatalog } from "@/test-support/db"
import {
  expectNoRawValues,
  FIXTURE_CUSTOMER,
  FIXTURE_RAW_VALUES,
} from "@/test-support/no-raw-values"
import { orderData, pickupOrderData } from "@/test-support/orders"
import { buildA } from "@/test-support/seed-parts"

import type { AdminRole } from "../permissions"
import { QueryDeniedError } from "./guard"
import { getPackingSlip } from "./orders"

// docs/specs/041-admin-orders-list-detail: E24, E25, E27, E28, R12, R13

const NUMBER = "PCS-7K3M9Q2X"

const fixture = {
  orderNumber: NUMBER,
  guestEmail: FIXTURE_CUSTOMER.email,
  contactName: FIXTURE_CUSTOMER.name,
  contactMobile: FIXTURE_CUSTOMER.mobile,
  street: FIXTURE_CUSTOMER.street,
}

async function withItems(orderId: string) {
  const parts = partsOfBuild(buildA())
  const ids = await insertParts(parts)
  const build = await db.build.create({
    data: { shareSlug: "slipbuild1", contentHash: "slip-hash" },
  })
  await db.orderItem.createMany({
    data: parts.slice(0, 3).map((part, position) => ({
      orderId,
      productId: ids.get(part.id)!,
      nameSnapshot: part.name,
      priceSnapshot: 123_456,
      quantity: 1,
      buildId: build.id,
      slot: part.category,
      position,
    })),
  })
}

beforeEach(async () => {
  vi.restoreAllMocks()
  await resetCatalog()
})
afterAll(() => db.$disconnect())

describe("the packing slip data", () => {
  test("E24: Owner and Staff get the courier's details", async () => {
    const order = await db.order.create({ data: orderData(fixture) })
    await withItems(order.id)
    for (const role of ["owner", "staff"] as const) {
      const slip = await getPackingSlip(role, NUMBER)
      expect(slip).toMatchObject({
        orderNumber: NUMBER,
        status: "PENDING_PAYMENT",
        contact: {
          masked: false,
          name: "Ana Reyes",
          mobile: "+639171234567",
        },
        address: { kind: "delivery", masked: false, street: "12 Mabini St" },
        weightGrams: 900,
      })
      expect(slip?.items).toHaveLength(3)
      expect(slip?.items.every((item) => item.buildId !== null)).toBe(true)
    }
  })

  test("R12: no price, total or email field exists, by name or by value", async () => {
    const order = await db.order.create({ data: orderData(fixture) })
    await withItems(order.id)
    const slip = await getPackingSlip("owner", NUMBER)
    const text = JSON.stringify(slip)
    for (const key of [
      "price",
      "Price",
      "total",
      "subtotal",
      "shippingFee",
      "discount",
      "voucher",
      "email",
      "guestEmail",
    ]) {
      expect(text, key).not.toContain(`"${key}"`)
    }
    // The item prices in the fixture and the order's amounts
    for (const value of ["123456", "2311000", "2299000", "12000"]) {
      expect(text, value).not.toMatch(new RegExp(`[:,\[]${value}[,}\]]`))
    }
    expect(text).not.toContain(FIXTURE_CUSTOMER.email)
    for (const item of slip?.items ?? []) {
      expect(Object.keys(item).sort()).toEqual([
        "buildId",
        "name",
        "quantity",
        "slot",
      ])
    }
  })

  test("E25: a pickup order has no address to print", async () => {
    const { street: _street, ...pickup } = fixture
    void _street
    await db.order.create({ data: pickupOrderData(pickup) })
    expect((await getPackingSlip("owner", NUMBER))?.address).toEqual({
      kind: "pickup",
    })
  })

  test("E27: Demo gets masks and the region only", async () => {
    await db.order.create({ data: orderData(fixture) })
    const slip = await getPackingSlip("demo", NUMBER)
    expect(slip?.contact).toEqual({
      masked: true,
      name: "A••• R•••",
      mobile: "+63•••••••••",
    })
    expect(slip?.address).toEqual({
      kind: "delivery",
      masked: true,
      regionName: "National Capital Region (NCR)",
      zone: "METRO_MANILA",
    })
    expectNoRawValues(slip, FIXTURE_RAW_VALUES)
  })

  test("the payment facts are there for the payment line", async () => {
    const paid = new Date("2026-11-02T06:10:00Z")
    await db.order.create({
      data: orderData({ ...fixture, status: "PAID", paidAt: paid }),
    })
    expect(await getPackingSlip("owner", NUMBER)).toMatchObject({
      status: "PAID",
      paymentOption: "ONLINE",
      paidAt: paid,
    })
  })

  test("E28: a malformed number is null and reads nothing", async () => {
    const findUnique = vi.spyOn(db.order, "findUnique")
    expect(await getPackingSlip("owner", "not-an-order")).toBeNull()
    expect(await getPackingSlip("owner", "")).toBeNull()
    expect(findUnique).not.toHaveBeenCalled()
  })

  test("E28: an unknown number is null", async () => {
    expect(await getPackingSlip("owner", "PCS-AAAAAAAA")).toBeNull()
  })

  test("an unknown role is refused", async () => {
    await expect(
      getPackingSlip("nobody" as AdminRole, NUMBER)
    ).rejects.toBeInstanceOf(QueryDeniedError)
  })
})
