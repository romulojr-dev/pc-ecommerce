import { NextRequest } from "next/server"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createCategoryAndBrand, db, resetCatalog } from "@/test-support/db"
import { seed } from "@/test-support/seed-parts"

import { GET } from "./route"

// GET /api/builder/parts (docs/specs/020-builder-page, Rules › Parts
// request): Zod-checked ids, 400 on bad input, never cached

let categoryId: string
let brandId: string

beforeEach(async () => {
  await resetCatalog()
  ;({ categoryId, brandId } = await createCategoryAndBrand())
})

afterAll(() => db.$disconnect())

async function insert(name: string) {
  const slug = name.toLowerCase().replaceAll(" ", "-")
  const { id } = await db.product.create({
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
    select: { id: true },
  })
  return id
}

const get = (query: string) =>
  GET(new NextRequest(`http://localhost/api/builder/parts${query}`))

describe("GET /api/builder/parts", () => {
  it("returns the parts, never cached (E37)", async () => {
    const first = await insert("Ryzen 5 7600")
    const second = await insert("Ryzen 5 7600X")

    const response = await get(`?ids=${first},${second}`)

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    const { parts } = await response.json()
    expect(
      parts.map((data: { part: { id: string } }) => data.part.id).sort()
    ).toEqual([first, second].sort())
  })

  it("leaves out ids no product has (E38)", async () => {
    const id = await insert("Ryzen 5 7600")
    const response = await get(`?ids=${id},cm0000000000000000000000000`)
    const { parts } = await response.json()
    expect(parts).toHaveLength(1)
  })

  it.each([
    ["21 ids (E41)", `?ids=${Array.from({ length: 21 }, (_, i) => `c${i}`)}`],
    ["no ids parameter (E42)", ""],
    ["an empty ids parameter (E42)", "?ids="],
    ["an empty id (E43)", "?ids=c1,,c2"],
    ["a malformed id (E44)", "?ids=..%2Fadmin"],
    ["a duplicate id (E45)", "?ids=c1,c1"],
  ])("answers 400 to %s, never cached", async (_, query) => {
    const response = await get(query)
    expect(response.status).toBe(400)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(await response.json()).toEqual({ error: "Invalid ids" })
  })
})
