import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { getBuilderCandidates } from "@/lib/builder-candidates"
import {
  createCategoryAndBrand,
  db,
  FIXTURE_TODAY,
  resetCatalog,
} from "@/test-support/db"
import { seed } from "@/test-support/seed-parts"

// The slot picker's candidates (docs/specs/021-slot-picker, Rules ›
// Candidates): every active product of the slot's category, with builder
// data and card data. Products get the Ryzen 5 7600's seed specs in "cpu",
// or the RTX 4060's in "gpu".

let cpuId: string
let gpuId: string
let brandId: string

beforeEach(async () => {
  await resetCatalog()
  ;({ categoryId: cpuId, brandId } = await createCategoryAndBrand())
  ;({ id: gpuId } = await db.category.create({
    data: { name: "Graphics Card", slug: "gpu" },
    select: { id: true },
  }))
})

afterAll(() => db.$disconnect())

type Fixture = {
  name: string
  category?: "cpu" | "gpu"
  // Pesos
  price?: number
  salePrice?: number
  stock?: number
  status?: "ACTIVE" | "DRAFT"
  preorderShipsOn?: string
  specs?: object
}

async function insert(product: Fixture) {
  const slug = product.name.toLowerCase().replaceAll(" ", "-")
  const gpu = product.category === "gpu"
  const { id } = await db.product.create({
    data: {
      name: product.name,
      slug,
      sku: `SKU-${slug}`,
      price: (product.price ?? 11_495) * 100,
      salePrice: product.salePrice && product.salePrice * 100,
      stock: product.stock ?? 12,
      lowStockAt: 5,
      preorderShipsOn: product.preorderShipsOn
        ? new Date(product.preorderShipsOn)
        : null,
      status: product.status ?? "ACTIVE",
      specs:
        product.specs ?? (gpu ? seed.rtx4060.specs : seed.ryzen5_7600.specs),
      weightGrams: 450,
      categoryId: gpu ? gpuId : cpuId,
      brandId,
    },
    select: { id: true },
  })
  return id
}

const load = (slot: "cpu" | "gpu" = "cpu") =>
  getBuilderCandidates(slot, FIXTURE_TODAY)

const names = async (slot: "cpu" | "gpu" = "cpu") =>
  (await load(slot)).map(({ data }) => data.part.name).sort()

describe("getBuilderCandidates", () => {
  it("returns builder data and card data for each part (E35)", async () => {
    const id = await insert({
      name: "Ryzen 5 7600X",
      price: 12_495,
      salePrice: 10_995,
    })
    await db.productImage.create({
      data: { productId: id, url: "/images/cpu.png", alt: "CPU", sortOrder: 0 },
    })

    const [candidate] = await load()
    expect(candidate.data).toEqual({
      part: {
        id,
        name: "Ryzen 5 7600X",
        category: "cpu",
        specs: seed.ryzen5_7600.specs,
      },
      slug: "ryzen-5-7600x",
      brand: "Alpha",
      price: 1_249_500,
      salePrice: 1_099_500,
      effectivePrice: 1_099_500,
      stock: 12,
      stockStatus: "in-stock",
      image: { url: "/images/cpu.png", alt: "CPU" },
    })
    expect(candidate.card).toMatchObject({
      name: "Ryzen 5 7600X",
      slug: "ryzen-5-7600x",
      categorySlug: "cpu",
      brand: "Alpha",
      price: 1_249_500,
      salePrice: 1_099_500,
      stock: 12,
      lowStockAt: 5,
      preorderShipsOn: null,
      image: { url: "/images/cpu.png", alt: "CPU" },
    })
    expect(candidate.card.summary).toEqual(expect.any(String))
  })

  it("returns only the slot's category", async () => {
    await insert({ name: "Ryzen 5 7600" })
    await insert({ name: "RTX 4060", category: "gpu" })
    expect(await names("cpu")).toEqual(["Ryzen 5 7600"])
    expect(await names("gpu")).toEqual(["RTX 4060"])
  })

  it("leaves out products that aren't active (E36)", async () => {
    await insert({ name: "Ryzen 5 7600" })
    await insert({ name: "Draft CPU", status: "DRAFT" })
    expect(await names()).toEqual(["Ryzen 5 7600"])
  })

  it("leaves out a product whose specs don't validate (E37)", async () => {
    await insert({ name: "Ryzen 5 7600" })
    await insert({ name: "Broken CPU", specs: { socket: "AM5" } })
    expect(await names()).toEqual(["Ryzen 5 7600"])
  })

  it("gives each stock status, with the card's pre-order date", async () => {
    await insert({ name: "In stock", stock: 12 })
    await insert({ name: "Low stock", stock: 3 })
    await insert({ name: "Out of stock", stock: 0 })
    await insert({ name: "Pre-order", stock: 6, preorderShipsOn: "2027-02-01" })

    const byName = new Map(
      (await load()).map((candidate) => [candidate.data.part.name, candidate])
    )
    expect(byName.get("In stock")!.data.stockStatus).toBe("in-stock")
    expect(byName.get("Low stock")!.data.stockStatus).toBe("low-stock")
    expect(byName.get("Out of stock")!.data.stockStatus).toBe("out-of-stock")
    const preorder = byName.get("Pre-order")!
    expect(preorder.data.stockStatus).toBe("pre-order")
    expect(preorder.card.preorderShipsOn).toBe("2027-02-01")
  })

  it("reads the current price on every call (E34)", async () => {
    const id = await insert({ name: "Ryzen 5 7600" })
    expect((await load())[0].data.effectivePrice).toBe(1_149_500)
    await db.product.update({ where: { id }, data: { price: 1_099_500 } })
    expect((await load())[0].data.effectivePrice).toBe(1_099_500)
  })

  it("returns nothing for an empty category", async () => {
    expect(await load("gpu")).toEqual([])
  })
})
