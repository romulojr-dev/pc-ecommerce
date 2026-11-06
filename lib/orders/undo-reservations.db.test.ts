import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { insertParts } from "@/test-support/build-fixtures"
import { db, resetCatalog } from "@/test-support/db"
import { heldOrder, stockOf } from "@/test-support/release"
import { seed } from "@/test-support/seed-parts"

import { undoReservations } from "./undo-reservations"

// docs/specs/044-admin-cancel-order: B17, R1, E21.

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

async function setup() {
  const ids = await insertParts([seed.ryzen5_7600, seed.ryzen5_5600], {
    [seed.ryzen5_7600.id]: { stock: 40, price: 1_149_500 },
    [seed.ryzen5_5600.id]: { stock: 40, price: 899_500 },
  })
  return {
    a: ids.get(seed.ryzen5_7600.id)!,
    b: ids.get(seed.ryzen5_5600.id)!,
  }
}

describe("undoReservations", () => {
  it("E21: gives stock back row for row", async () => {
    const { a, b } = await setup()
    const o1 = await heldOrder([
      { productId: a, quantity: 2 },
      { productId: b, quantity: 1 },
    ])
    const o2 = await heldOrder([{ productId: b, quantity: 3 }])
    const o3 = await heldOrder([{ productId: a, quantity: 1 }])
    expect(await stockOf(a)).toBe(37)
    expect(await stockOf(b)).toBe(36)

    const result = await db.$transaction((tx) =>
      undoReservations(tx, [o1.id, o2.id, o3.id])
    )

    expect(await stockOf(a)).toBe(40)
    expect(await stockOf(b)).toBe(40)
    expect([...result.withReservation].sort()).toEqual(
      [o1.id, o2.id, o3.id].sort()
    )
    const released = await db.stockMovement.findMany({
      where: { reason: "ORDER_RELEASED" },
    })
    expect(released).toHaveLength(4)
    expect(released.every((m) => m.actorId === null)).toBe(true)
  })

  it("returns stock of a retired product too", async () => {
    const { a } = await setup()
    const order = await heldOrder([{ productId: a, quantity: 2 }])
    await db.product.update({ where: { id: a }, data: { status: "DRAFT" } })
    await db.$transaction((tx) => undoReservations(tx, [order.id]))
    expect(await stockOf(a)).toBe(40)
  })

  it("an order with no reservation returns nothing", async () => {
    const { a } = await setup()
    const order = await db.order.create({
      data: (await import("@/test-support/orders")).orderData(),
    })
    const result = await db.$transaction((tx) =>
      undoReservations(tx, [order.id])
    )
    expect(result.withReservation.size).toBe(0)
    expect(await stockOf(a)).toBe(40)
  })
})
