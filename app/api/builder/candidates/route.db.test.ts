import { NextRequest } from "next/server"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createCategoryAndBrand, db, resetCatalog } from "@/test-support/db"
import { seed } from "@/test-support/seed-parts"

import { GET } from "./route"

// GET /api/builder/candidates (docs/specs/021-slot-picker, Rules ›
// Candidates): one Zod-checked slot, 400 on anything else, never cached

let categoryId: string
let brandId: string

beforeEach(async () => {
  await resetCatalog()
  ;({ categoryId, brandId } = await createCategoryAndBrand())
})

afterAll(() => db.$disconnect())

async function insert(name: string) {
  const slug = name.toLowerCase().replaceAll(" ", "-")
  await db.product.create({
    data: {
      name,
      slug,
      sku: `SKU-${slug}`,
      price: 1_149_500,
      stock: 12,
      status: "ACTIVE",
      specs: seed.ryzen5_7600.specs,
      weightGrams: 450,
      categoryId,
      brandId,
    },
  })
}

const get = (query: string) =>
  GET(new NextRequest(`http://localhost/api/builder/candidates${query}`))

describe("GET /api/builder/candidates", () => {
  it("returns the slot's candidates and today, never cached (E35)", async () => {
    await insert("Ryzen 5 7600")
    await insert("Ryzen 5 7600X")

    const response = await get("?slot=cpu")

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    const body = await response.json()
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(
      body.candidates
        .map((c: { data: { part: { name: string } } }) => c.data.part.name)
        .sort()
    ).toEqual(["Ryzen 5 7600", "Ryzen 5 7600X"])
  })

  it("takes a slot with a hyphen (E35a)", async () => {
    const response = await get("?slot=cpu-cooler")
    expect(response.status).toBe(200)
    expect((await response.json()).candidates).toEqual([])
  })

  it.each([
    ["an unknown slot (E38)", "?slot=keyboard"],
    ["no slot (E38a)", ""],
    ["an empty slot (E38a)", "?slot="],
    ["another case (E38b)", "?slot=CPU"],
    ["a space (E38b)", "?slot=%20cpu"],
    ["a repeated slot (E38c)", "?slot=cpu&slot=gpu"],
    ["a category that isn't a slot (E38d)", "?slot=fans"],
    ["a path (E38e)", "?slot=../admin"],
  ])("answers 400 to %s, with no product data", async (_, query) => {
    await insert("Ryzen 5 7600")

    const response = await get(query)

    expect(response.status).toBe(400)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(await response.json()).toEqual({ error: "Invalid slot" })
  })
})
