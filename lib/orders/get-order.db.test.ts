import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { newCartId } from "@/lib/cart/id"
import { reviewCheckout } from "@/lib/checkout/review-checkout"
import { shippingSeed } from "@/prisma/seed/data/shipping"
import { writeSeed } from "@/prisma/seed/write"
import { insertParts } from "@/test-support/build-fixtures"
import { db, resetCatalog } from "@/test-support/db"
import { seed } from "@/test-support/seed-parts"

import { getOrderForPage } from "./get-order"
import { newAccessToken } from "./secrets"
import { placeOrder } from "./place-order"

// docs/specs/030-place-an-order: the order page's access rules and snapshots
// (V1–V5, V12, V13 and the pickup store, D5)

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidateTag: vi.fn(),
}))

beforeEach(async () => {
  ryzenId = null
  await resetCatalog()
  await writeSeed(db, [], { reset: false, shipping: shippingSeed })
})
afterAll(() => db.$disconnect())

const contact = {
  email: "ana@example.com",
  name: "Ana Santos",
  mobile: "0917 123 4567",
}
const QC = {
  regionCode: "1300000000",
  provinceCode: "1300000000",
  cityCode: "1381300000",
  barangayCode: "1381300001",
  street: "12 Mabini St",
  zip: "1100",
}

// The Ryzen is inserted by the first order of a test and reused after
let ryzenId: string | null = null

// Places an order for two Ryzens and returns its link parts
async function placeRyzens(details: object) {
  if (!ryzenId) {
    const ids = await insertParts([seed.ryzen5_7600], {
      [seed.ryzen5_7600.id]: { price: 1_149_500, stock: 12 },
    })
    ryzenId = ids.get(seed.ryzen5_7600.id)!
  }
  const productId = ryzenId
  const cartId = newCartId()
  await db.cart.create({ data: { id: cartId } })
  await db.cartItem.create({ data: { cartId, productId, quantity: 2 } })
  const review = await reviewCheckout(cartId, details)
  if (!review.ok) throw new Error("review failed")
  const placed = await placeOrder(cartId, {
    details,
    digest: review.digest,
    idempotencyKey: review.idempotencyKey,
    accessToken: review.accessToken,
  })
  if (!placed.ok) throw new Error("placement failed")
  return { number: placed.orderNumber, key: placed.accessToken, productId }
}

const delivery = { method: "delivery", contact, address: QC }
const pickup = { method: "pickup", contact }

describe("the right link", () => {
  it("V1: gives the order from its snapshots", async () => {
    const { number, key } = await placeRyzens(delivery)

    const order = await getOrderForPage(number, key)

    expect(order).toMatchObject({
      orderNumber: number,
      status: "PENDING_PAYMENT",
      fulfillment: "DELIVERY",
      contact: {
        name: "Ana Santos",
        email: "ana@example.com",
        mobile: "+639171234567",
      },
      address: {
        street: "12 Mabini St",
        barangay: "Alicia",
        city: "Quezon City",
        province: "Metro Manila",
        region: "National Capital Region (NCR)",
        zip: "1100",
      },
      store: null,
      subtotal: 2_299_000,
      shippingFee: 12_000,
      discount: 0,
      total: 2_311_000,
    })
    expect(order?.items).toEqual([
      {
        name: seed.ryzen5_7600.name,
        unitPrice: 1_149_500,
        quantity: 2,
        buildId: null,
        slot: null,
      },
    ])
    expect(order?.expiresAt.getTime()).toBeGreaterThan(
      order!.createdAt.getTime()
    )
  })

  it("a pickup order carries the store's current address and hours (D5)", async () => {
    const { number, key } = await placeRyzens(pickup)
    await db.storeSettings.update({
      where: { id: 1 },
      data: { storeAddress: "New address", storeHours: "New hours" },
    })

    const order = await getOrderForPage(number, key)

    expect(order).toMatchObject({
      fulfillment: "PICKUP",
      address: null,
      store: { address: "New address", hours: "New hours" },
    })
  })

  it("V12: keeps the name and price it was placed with", async () => {
    const { number, key, productId } = await placeRyzens(delivery)
    await db.product.update({
      where: { id: productId },
      data: { name: "Renamed", price: 1 },
    })

    const order = await getOrderForPage(number, key)

    expect(order?.items[0]).toMatchObject({
      name: seed.ryzen5_7600.name,
      unitPrice: 1_149_500,
    })
  })

  it("V13: still opens after a part is retired", async () => {
    const { number, key, productId } = await placeRyzens(delivery)
    await db.product.update({
      where: { id: productId },
      data: { status: "DRAFT" },
    })

    expect(await getOrderForPage(number, key)).not.toBeNull()
  })
})

describe("every bad link is the same null (V2–V5)", () => {
  it("V2: a wrong key", async () => {
    const { number } = await placeRyzens(delivery)
    expect(await getOrderForPage(number, newAccessToken())).toBeNull()
  })

  it("V3: an unknown number with a well-formed key", async () => {
    const { key } = await placeRyzens(delivery)
    expect(await getOrderForPage("PCS-00000000", key)).toBeNull()
  })

  it("V4: no key", async () => {
    const { number } = await placeRyzens(delivery)
    expect(await getOrderForPage(number, undefined)).toBeNull()
    expect(await getOrderForPage(number, "")).toBeNull()
  })

  it("one order's key doesn't open another", async () => {
    const first = await placeRyzens(delivery)
    const second = await placeRyzens(delivery)
    expect(await getOrderForPage(first.number, second.key)).toBeNull()
  })

  it("V5: a malformed number or key is null without a database read", async () => {
    const { number, key } = await placeRyzens(delivery)
    const find = vi.spyOn(db.order, "findUnique")

    try {
      for (const [n, k] of [
        ["abc", key],
        [number.toLowerCase(), key],
        [`${number}9`, key],
        [number, key.slice(0, 42)],
        [number, `${key}A`],
        [number, "A".repeat(42) + "B"],
        [["PCS-00000000"], key],
        [number, ["x"]],
      ] as const) {
        expect(await getOrderForPage(n, k)).toBeNull()
      }
      expect(find).not.toHaveBeenCalled()

      // The good pair does read
      expect(await getOrderForPage(number, key)).not.toBeNull()
      expect(find).toHaveBeenCalledTimes(1)
    } finally {
      find.mockRestore()
    }
  })

  it("a well-formed pair reads the database once, found or not", async () => {
    const { number } = await placeRyzens(delivery)
    const find = vi.spyOn(db.order, "findUnique")

    try {
      await getOrderForPage(number, newAccessToken())
      await getOrderForPage("PCS-00000000", newAccessToken())
      expect(find).toHaveBeenCalledTimes(2)
    } finally {
      find.mockRestore()
    }
  })
})
