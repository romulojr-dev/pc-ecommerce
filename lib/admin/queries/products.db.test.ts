import { afterAll, beforeEach, describe, expect, test } from "vitest"

import { db } from "@/lib/db"
import { resetCatalog } from "@/test-support/db"

import { DEFAULT_PRODUCT_PARAMS } from "../products-params"
import { QueryDeniedError } from "./guard"
import { getProductForEdit, listBrandOptions, listProducts } from "./products"

// docs/specs/045-admin-products-create-edit, E1–E6: the product list and the
// edit read through the real query layer

beforeEach(async () => {
  await resetCatalog()
  const [cpu, gpu] = await Promise.all([
    db.category.create({ data: { name: "CPU", slug: "cpu" } }),
    db.category.create({ data: { name: "Graphics Card", slug: "gpu" } }),
  ])
  const [amd, asus] = await Promise.all([
    db.brand.create({ data: { name: "AMD", slug: "amd" } }),
    db.brand.create({ data: { name: "ASUS", slug: "asus" } }),
  ])
  const base = { specs: {}, price: 1_000_000, weightGrams: 500 }
  await db.product.create({
    data: {
      ...base,
      name: "AMD Ryzen 5 7600",
      slug: "ryzen-5-7600",
      sku: "100-100001015BOX",
      status: "ACTIVE",
      categoryId: cpu.id,
      brandId: amd.id,
      stock: 4,
      salePrice: 900_000,
      isFeatured: true,
      preorderShipsOn: new Date("2027-01-15"),
    },
  })
  await db.product.create({
    data: {
      ...base,
      name: "ASUS Dual RTX 4060",
      slug: "dual-rtx-4060",
      sku: "DUAL-RTX4060-O8G",
      status: "DRAFT",
      categoryId: gpu.id,
      brandId: asus.id,
    },
  })
})
afterAll(() => db.$disconnect())

describe("listProducts", () => {
  test("lists every status, drafts included (E1)", async () => {
    const list = await listProducts("owner", DEFAULT_PRODUCT_PARAMS)
    expect(list.total).toBe(2)
    expect(list.rows.map((r) => r.status).sort()).toEqual(["ACTIVE", "DRAFT"])
    const ryzen = list.rows.find((r) => r.sku === "100-100001015BOX")!
    expect(ryzen).toMatchObject({
      categorySlug: "cpu",
      categoryName: "CPU",
      brandName: "AMD",
      price: 1_000_000,
      salePrice: 900_000,
      stock: 4,
      isFeatured: true,
    })
  })

  test("Demo reads the same rows as Owner (B1)", async () => {
    expect(await listProducts("demo", DEFAULT_PRODUCT_PARAMS)).toEqual(
      await listProducts("owner", DEFAULT_PRODUCT_PARAMS)
    )
  })

  test("Staff is refused", async () => {
    await expect(
      listProducts("staff", DEFAULT_PRODUCT_PARAMS)
    ).rejects.toBeInstanceOf(QueryDeniedError)
  })

  test("searches name, SKU and brand, case-insensitively (E2)", async () => {
    const find = async (q: string) =>
      (await listProducts("owner", { ...DEFAULT_PRODUCT_PARAMS, q })).rows.map(
        (r) => r.sku
      )
    expect(await find("RYZEN")).toEqual(["100-100001015BOX"])
    expect(await find("dual-rtx4060")).toEqual(["DUAL-RTX4060-O8G"])
    expect(await find("asus")).toEqual(["DUAL-RTX4060-O8G"])
    expect(await find("nothing")).toEqual([])
  })

  test("a % or _ in the search is text, not a wildcard", async () => {
    const list = await listProducts("owner", {
      ...DEFAULT_PRODUCT_PARAMS,
      q: "%%",
    })
    expect(list.total).toBe(0)
  })

  test("filters by category and status (E4)", async () => {
    const draftGpu = await listProducts("owner", {
      ...DEFAULT_PRODUCT_PARAMS,
      category: "gpu",
      status: "draft",
    })
    expect(draftGpu.rows.map((r) => r.sku)).toEqual(["DUAL-RTX4060-O8G"])
    const activeGpu = await listProducts("owner", {
      ...DEFAULT_PRODUCT_PARAMS,
      category: "gpu",
      status: "active",
    })
    expect(activeGpu.total).toBe(0)
    expect(activeGpu.page).toBe(1)
  })

  test("pages 25 at a time, newest edit first, a page past the last lands on the last", async () => {
    const category = await db.category.findUniqueOrThrow({
      where: { slug: "cpu" },
    })
    const brand = await db.brand.findUniqueOrThrow({ where: { slug: "amd" } })
    await db.product.createMany({
      data: Array.from({ length: 24 }, (_, index) => ({
        name: `Bulk ${index}`,
        slug: `bulk-${index}`,
        sku: `BULK-${index}`,
        specs: {},
        price: 100,
        weightGrams: 1,
        categoryId: category.id,
        brandId: brand.id,
      })),
    })
    const first = await listProducts("owner", DEFAULT_PRODUCT_PARAMS)
    expect(first.total).toBe(26)
    expect(first.rows).toHaveLength(25)
    expect(first.pageCount).toBe(2)
    const last = await listProducts("owner", {
      ...DEFAULT_PRODUCT_PARAMS,
      page: 9,
    })
    expect(last.page).toBe(2)
    expect(last.rows).toHaveLength(1)
    // most recently changed first: the page-2 row is the oldest
    expect(last.rows[0].sku).toBe("100-100001015BOX")
  })
})

describe("getProductForEdit", () => {
  test("returns the editable fields and the edit token (B14)", async () => {
    const { id } = await db.product.findUniqueOrThrow({
      where: { sku: "100-100001015BOX" },
    })
    const product = await getProductForEdit("owner", id)
    expect(product).toMatchObject({
      id,
      status: "ACTIVE",
      sku: "100-100001015BOX",
      slug: "ryzen-5-7600",
      categorySlug: "cpu",
      editVersion: 0,
      preorderShipsOn: "2027-01-15",
      stock: 4,
    })
    expect(Object.keys(product!)).not.toContain("effectivePrice")
    expect(Object.keys(product!)).not.toContain("searchVector")
  })

  test("an unknown or malformed id is null", async () => {
    expect(await getProductForEdit("owner", "nope")).toBeNull()
    expect(await getProductForEdit("owner", "a/b")).toBeNull()
    expect(await getProductForEdit("owner", "x".repeat(100))).toBeNull()
  })

  test("Staff is refused", async () => {
    await expect(getProductForEdit("staff", "abc")).rejects.toBeInstanceOf(
      QueryDeniedError
    )
  })
})

describe("listBrandOptions", () => {
  test("lists brands by name", async () => {
    expect((await listBrandOptions("owner")).map((b) => b.name)).toEqual([
      "AMD",
      "ASUS",
    ])
  })
})
