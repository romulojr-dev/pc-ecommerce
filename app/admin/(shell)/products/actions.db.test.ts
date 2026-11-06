import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

import { db, resetCatalog } from "@/test-support/db"
import {
  makeStaffUser,
  resetSignInIps,
  signInCookie,
} from "@/test-support/admin-session"
import type { ProductFormInput } from "@/lib/admin/product-input"

import { createProductAction, updateProductAction } from "./actions"

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

// docs/specs/045-admin-products-create-edit: the actions' guard and the cache
// call (E7, E15, E26, R11, R12, R14)

let brandId: string

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
  await db.category.create({ data: { slug: "psu", name: "Power Supply" } })
  brandId = (
    await db.brand.create({ data: { slug: "corsair", name: "Corsair" } })
  ).id
})
afterAll(() => db.$disconnect())

const form = (overrides: Partial<ProductFormInput> = {}): ProductFormInput => ({
  categorySlug: "psu",
  name: "Corsair RM1000e",
  sku: "RM1000E-TEST",
  slug: "corsair-rm1000e",
  brandId,
  featured: false,
  price: "9,499.50",
  salePrice: "",
  description: "",
  weightGrams: "2100",
  warrantyMonths: "120",
  boxContents: "",
  preorderShipsOn: "",
  specs: {
    formFactor: "ATX",
    wattageW: "1000",
    efficiencyRating: "GOLD",
    modularity: "FULL",
  },
  ...overrides,
})

describe("as an owner", () => {
  test("create then edit: updateTag(products) once each (E7, E15)", async () => {
    await signInAs("owner@example.com", "OWNER")
    const created = await createProductAction(form())
    expect(created).toMatchObject({ ok: true, data: { kind: "saved" } })
    expect(updateTag).toHaveBeenCalledTimes(1)
    expect(updateTag).toHaveBeenCalledWith("products")
    if (!created.ok || created.data.kind !== "saved") return

    const edited = await updateProductAction({
      ...form({ price: "9,000" }),
      id: created.data.id,
      expectedVersion: created.data.editVersion,
    })
    expect(edited).toMatchObject({ ok: true, data: { kind: "saved" } })
    expect(updateTag).toHaveBeenCalledTimes(2)
  })

  test("invalid, stale, unchanged and not-found never call updateTag", async () => {
    await signInAs("owner@example.com", "OWNER")
    const created = await createProductAction(form())
    if (!created.ok || created.data.kind !== "saved") throw new Error("setup")
    vi.mocked(updateTag).mockClear()
    const id = created.data.id

    expect(
      await createProductAction(form({ name: "x", sku: "A", slug: "a-a" }))
    ).toMatchObject({
      ok: true,
      data: { kind: "invalid" },
    })
    expect(
      await updateProductAction({ ...form(), id, expectedVersion: 5 })
    ).toMatchObject({
      data: { kind: "stale" },
    })
    expect(
      await updateProductAction({ ...form(), id, expectedVersion: 0 })
    ).toMatchObject({
      data: { kind: "unchanged" },
    })
    expect(
      await updateProductAction({ ...form(), id: "nope", expectedVersion: 0 })
    ).toMatchObject({
      data: { kind: "not-found" },
    })
    expect(updateTag).not.toHaveBeenCalled()
  })

  test("E25: a hand-made request with stock or effectivePrice is invalid, nothing is written", async () => {
    await signInAs("owner@example.com", "OWNER")
    const result = await createProductAction({
      ...form(),
      stock: 50,
      effectivePrice: 1,
    } as never)
    expect(result).toMatchObject({ ok: false, error: "invalid" })
    expect(await db.product.count()).toBe(0)
    expect(updateTag).not.toHaveBeenCalled()
  })
})

describe.each(["DEMO", "STAFF"])("as %s (E26, R12)", (role) => {
  test("both actions are refused: no rows, no audit, no updateTag", async () => {
    await signInAs(`${role.toLowerCase()}@example.com`, role)
    const created = await createProductAction(form())
    expect(created).toMatchObject({ ok: false, error: "forbidden" })
    const edited = await updateProductAction({
      ...form(),
      id: "x",
      expectedVersion: 0,
    })
    expect(edited).toMatchObject({ ok: false, error: "forbidden" })
    expect(await db.product.count()).toBe(0)
    expect(await db.auditLog.count()).toBe(0)
    expect(updateTag).not.toHaveBeenCalled()
  })
})

test("a signed-out call is refused", async () => {
  expect(await createProductAction(form())).toMatchObject({
    ok: false,
    error: "unauthenticated",
  })
})

test("R14: the module exports no delete action", () => {
  const source = readFileSync(join(__dirname, "actions.ts"), "utf8")
  const exported = [...source.matchAll(/export const (\w+)/g)].map((m) => m[1])
  expect(exported.sort()).toEqual([
    "createProductAction",
    "updateProductAction",
  ])
  expect(exported.join(" ")).not.toMatch(/delete|remove/i)
})
