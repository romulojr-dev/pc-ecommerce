import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

import { insertParts } from "@/test-support/build-fixtures"
import {
  makeStaffUser,
  resetSignInIps,
  signInCookie,
} from "@/test-support/admin-session"
import { db, resetCatalog } from "@/test-support/db"
import { seed } from "@/test-support/seed-parts"

import { adjustStockAction, setLowStockAtAction } from "./actions"

let currentHeaders = new Headers()
vi.mock("next/headers", () => ({ headers: async () => currentHeaders }))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  },
}))
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  updateTag: vi.fn(),
}))

import { updateTag } from "next/cache"

// docs/specs/046-admin-inventory-adjustments: the actions' guard and the cache
// call (E7, E10, E15, E21, E24, E31, R10, R11)

let productId: string

async function signInAs(email: string, role: string) {
  await makeStaffUser(email, role)
  currentHeaders = new Headers({ cookie: await signInCookie(email) })
}

beforeEach(async () => {
  resetSignInIps()
  currentHeaders = new Headers()
  vi.mocked(updateTag).mockClear()
  await resetCatalog()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
  productId = (
    await insertParts([seed.ryzen5_7600], {
      [seed.ryzen5_7600.id]: { stock: 10 },
    })
  ).get(seed.ryzen5_7600.id)!
})
afterAll(() => db.$disconnect())

const adjustment = (over: Record<string, unknown> = {}) => ({
  productId,
  reason: "RECEIVED",
  delta: 20,
  note: "",
  shownStock: 10,
  ...over,
})
const stock = async () =>
  (await db.product.findUniqueOrThrow({ where: { id: productId } })).stock

describe.each(["OWNER", "STAFF"])("as %s", (role) => {
  test("E7: an adjustment writes once and calls updateTag(products) once", async () => {
    await signInAs(`${role.toLowerCase()}@example.com`, role)
    const result = await adjustStockAction(adjustment())
    expect(result).toMatchObject({
      ok: true,
      data: { kind: "adjusted", stock: 30 },
    })
    expect(await stock()).toBe(30)
    expect(updateTag).toHaveBeenCalledTimes(1)
    expect(updateTag).toHaveBeenCalledWith("products")
    const [movement] = await db.stockMovement.findMany()
    expect(movement.actorId).toBe(
      (
        await db.user.findFirstOrThrow({
          where: { role: role as "OWNER" | "STAFF" },
        })
      ).id
    )
  })

  test("E21: the threshold writes once and calls updateTag once", async () => {
    await signInAs(`${role.toLowerCase()}@example.com`, role)
    expect(
      await setLowStockAtAction({ productId, lowStockAt: 8 })
    ).toMatchObject({ ok: true, data: { kind: "saved", lowStockAt: 8 } })
    expect(updateTag).toHaveBeenCalledTimes(1)
  })

  test("invalid, refused, unchanged and not-found never call updateTag", async () => {
    await signInAs(`${role.toLowerCase()}@example.com`, role)
    // E10: a Correction without a note
    expect(
      await adjustStockAction(adjustment({ reason: "CORRECTION" }))
    ).toMatchObject({ ok: true, data: { kind: "invalid" } })
    // E12: below zero
    expect(
      await adjustStockAction(adjustment({ reason: "DAMAGED", delta: -11 }))
    ).toMatchObject({
      ok: true,
      data: { kind: "refused", refusal: { kind: "too-low", stock: 10 } },
    })
    expect(
      await adjustStockAction(adjustment({ productId: "nope" }))
    ).toMatchObject({ ok: true, data: { kind: "not-found" } })
    // E24: the same threshold
    expect(
      await setLowStockAtAction({ productId, lowStockAt: 5 })
    ).toMatchObject({ ok: true, data: { kind: "unchanged" } })
    expect(
      await setLowStockAtAction({ productId, lowStockAt: 5000 })
    ).toMatchObject({ ok: true, data: { kind: "invalid" } })
    expect(updateTag).not.toHaveBeenCalled()
    expect(await stock()).toBe(10)
    expect(await db.stockMovement.count()).toBe(0)
    expect(await db.auditLog.count()).toBe(0)
  })

  test("E15: a hand-made 'set to N' or extra key is invalid and writes nothing", async () => {
    await signInAs(`${role.toLowerCase()}@example.com`, role)
    for (const extra of [{ stock: 50 }, { setStock: 50 }, { newStock: 50 }]) {
      expect(await adjustStockAction(adjustment(extra))).toMatchObject({
        ok: false,
        error: "invalid",
      })
    }
    expect(await stock()).toBe(10)
    expect(updateTag).not.toHaveBeenCalled()
  })
})

describe("as DEMO (E31, R11)", () => {
  test("both actions are refused: no rows, no audit, no updateTag", async () => {
    await signInAs("demo@example.com", "DEMO")
    expect(await adjustStockAction(adjustment())).toMatchObject({
      ok: false,
      error: "forbidden",
    })
    expect(
      await setLowStockAtAction({ productId, lowStockAt: 8 })
    ).toMatchObject({ ok: false, error: "forbidden" })
    expect(await stock()).toBe(10)
    expect(await db.stockMovement.count()).toBe(0)
    expect(await db.auditLog.count()).toBe(0)
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: productId } }))
        .lowStockAt
    ).toBe(5)
    expect(updateTag).not.toHaveBeenCalled()
  })
})

test("a signed-out call is refused", async () => {
  expect(await adjustStockAction(adjustment())).toMatchObject({
    ok: false,
    error: "unauthenticated",
  })
})

test("the module exports exactly the two guarded actions, and no 'set stock' one", () => {
  const source = readFileSync(join(__dirname, "actions.ts"), "utf8")
  const exported = [...source.matchAll(/export const (\w+)/g)].map((m) => m[1])
  expect(exported.sort()).toEqual(["adjustStockAction", "setLowStockAtAction"])
  expect(exported.join(" ")).not.toMatch(/set(Stock|Quantity)/i)
})
