import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import * as audit from "@/lib/admin/audit"
import type { AdminActor } from "@/lib/admin/guard"
import type { ProductFormInput } from "@/lib/admin/product-input"
import { formValuesFromSpecs } from "@/lib/specs/form-fields"
import { makeStaffUser } from "@/test-support/admin-session"
import { db, resetCatalog } from "@/test-support/db"
import { seedPart } from "@/test-support/seed-parts"

import { createProduct, updateProduct } from "./save"

vi.mock("@/lib/admin/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/audit")>()
  return { ...actual, recordAudit: vi.fn(actual.recordAudit) }
})

// docs/specs/045-admin-products-create-edit: create and edit on real rows
// (E7–E11, E14b–E23c, E31). The server action's guard and cache calls are in
// actions.db.test.ts.

const TODAY = "2026-11-06"

let actor: AdminActor
let brandId: string

beforeEach(async () => {
  await resetCatalog()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
  const user = await makeStaffUser("owner@example.com", "OWNER")
  actor = { id: user.id, name: user.name, role: "owner" }
  await db.category.createMany({
    data: [
      { slug: "psu", name: "Power Supply" },
      { slug: "cpu", name: "CPU" },
      { slug: "motherboard", name: "Motherboard" },
    ],
  })
  brandId = (
    await db.brand.create({ data: { slug: "corsair", name: "Corsair" } })
  ).id
  vi.mocked(audit.recordAudit).mockClear()
})
afterAll(() => db.$disconnect())

const psuSpecs = {
  formFactor: "ATX",
  wattageW: "1000",
  efficiencyRating: "GOLD",
  modularity: "FULL",
}

function form(overrides: Partial<ProductFormInput> = {}): ProductFormInput {
  return {
    categorySlug: "psu",
    name: "Corsair RM1000e",
    sku: "RM1000E-TEST",
    slug: "corsair-rm1000e",
    brandId,
    featured: false,
    price: "9,499.5",
    salePrice: "",
    description: "",
    weightGrams: "2100",
    warrantyMonths: "120",
    boxContents: "",
    preorderShipsOn: "",
    specs: psuSpecs,
    ...overrides,
  }
}

const cpuSpecs = () =>
  formValuesFromSpecs("cpu", seedPart("cpu", "100-100001015BOX").specs)
const boardSpecs = () =>
  formValuesFromSpecs(
    "motherboard",
    seedPart("motherboard", "90MB1BP0-M0AAY0").specs
  )

async function created(overrides: Partial<ProductFormInput> = {}) {
  const result = await createProduct(actor, form(overrides), TODAY)
  if (result.kind !== "saved") throw new Error(`not saved: ${result.kind}`)
  return result
}

const version = async (id: string) =>
  (await db.product.findUniqueOrThrow({ where: { id } })).editVersion

const edit = (id: string, expectedVersion: number, overrides = {}) => ({
  ...form(overrides),
  id,
  expectedVersion,
})

describe("createProduct", () => {
  it("E7: saves a draft at stock 0 with its audit row, in centavos", async () => {
    const result = await createProduct(actor, form(), TODAY)
    expect(result.kind).toBe("saved")
    const product = await db.product.findUniqueOrThrow({
      where: { sku: "RM1000E-TEST" },
    })
    expect(product).toMatchObject({
      status: "DRAFT",
      stock: 0,
      price: 949950,
      salePrice: null,
      effectivePrice: 949950, // set by the trigger
      editVersion: 0,
      isFeatured: false,
      specs: {
        formFactor: "ATX",
        wattageW: 1000,
        efficiencyRating: "GOLD",
        modularity: "FULL",
      },
    })
    const rows = await db.auditLog.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actorId: actor.id,
      entity: "product",
      entityId: product.id,
      action: "created",
      after: { sku: "RM1000E-TEST", category: "psu", price: 949950 },
    })
  })

  it("E7: a sale price sets effectivePrice through the trigger", async () => {
    const { id } = await created({ price: "10,000", salePrice: "8,000" })
    const product = await db.product.findUniqueOrThrow({ where: { id } })
    expect(product.effectivePrice).toBe(800000)
  })

  it("E8: a missing required spec saves nothing", async () => {
    const result = await createProduct(
      actor,
      form({ specs: { ...psuSpecs, wattageW: "" } }),
      TODAY
    )
    expect(result).toMatchObject({ kind: "invalid" })
    if (result.kind === "invalid") {
      expect(Object.keys(result.errors)).toEqual(["specs.wattageW"])
    }
    expect(await db.product.count()).toBe(0)
    expect(await db.auditLog.count()).toBe(0)
  })

  it("E9: a cross-field spec rule is reported on its field", async () => {
    const result = await createProduct(
      actor,
      form({
        categorySlug: "cpu",
        specs: { ...cpuSpecs(), cores: "6", threads: "4" },
      }),
      TODAY
    )
    expect(result).toMatchObject({
      kind: "invalid",
      errors: { "specs.threads": "must be at least cores (6)" },
    })
    expect(await db.product.count()).toBe(0)
  })

  it("E10: a generation that doesn't belong to the socket is refused", async () => {
    const result = await createProduct(
      actor,
      form({
        categorySlug: "cpu",
        specs: {
          ...cpuSpecs(),
          socket: "AM5",
          generation: "raptor-lake-refresh",
        },
      }),
      TODAY
    )
    expect(result.kind).toBe("invalid")
    if (result.kind === "invalid") {
      expect(result.errors["specs.generation"]).toMatch(/AM5/)
    }
  })

  it("reports common-field and spec problems together", async () => {
    const result = await createProduct(
      actor,
      form({ name: "x", price: "1299.505", specs: {} }),
      TODAY
    )
    expect(result.kind).toBe("invalid")
    if (result.kind === "invalid") {
      expect(result.errors.name).toBeDefined()
      expect(result.errors.price).toBeDefined()
      expect(result.errors["specs.wattageW"]).toBeDefined()
    }
  })

  it("an unknown brand or category is a field error", async () => {
    const brand = await createProduct(actor, form({ brandId: "nope" }), TODAY)
    expect(brand).toMatchObject({
      kind: "invalid",
      errors: { brandId: "Choose a brand." },
    })
    await db.category.deleteMany({ where: { slug: "psu" } })
    const category = await createProduct(actor, form(), TODAY)
    expect(category).toMatchObject({
      kind: "invalid",
      errors: { categorySlug: "Choose a category." },
    })
  })

  it("E19–E21: SKU and slug clashes are field errors, SKU ignoring case", async () => {
    await created()
    expect(
      await createProduct(actor, form({ slug: "another-one" }), TODAY)
    ).toMatchObject({
      kind: "invalid",
      errors: { sku: "This SKU is already used by another product." },
    })
    expect(
      await createProduct(
        actor,
        form({ sku: "rm1000e-test", slug: "another-one" }),
        TODAY
      )
    ).toMatchObject({ kind: "invalid", errors: { sku: expect.any(String) } })
    expect(
      await createProduct(actor, form({ sku: "OTHER-SKU" }), TODAY)
    ).toMatchObject({
      kind: "invalid",
      errors: { slug: "This slug is already used by another product." },
    })
    expect(await db.product.count()).toBe(1)
  })

  it("E22: two creates of the same SKU at once: one saves, one gets the field error", async () => {
    const results = await Promise.all([
      createProduct(actor, form({ slug: "slug-a" }), TODAY),
      createProduct(actor, form({ slug: "slug-b" }), TODAY),
    ])
    expect(results.map((r) => r.kind).sort()).toEqual(["invalid", "saved"])
    const failed = results.find((r) => r.kind === "invalid")!
    if (failed.kind === "invalid") expect(failed.errors.sku).toBeDefined()
    expect(await db.product.count()).toBe(1)
    expect(await db.auditLog.count()).toBe(1)
  })

  it("E31: a failing audit write rolls the product back", async () => {
    vi.mocked(audit.recordAudit).mockRejectedValueOnce(new Error("boom"))
    await expect(createProduct(actor, form(), TODAY)).rejects.toThrow("boom")
    expect(await db.product.count()).toBe(0)
    expect(await db.auditLog.count()).toBe(0)
  })
})

describe("updateProduct", () => {
  it("E15: a price change is audited with before and after, and bumps editVersion", async () => {
    const { id } = await created({ price: "14,500" })
    vi.mocked(audit.recordAudit).mockClear()
    const result = await updateProduct(
      actor,
      edit(id, 0, { price: "13,900" }),
      TODAY
    )
    expect(result).toEqual({ kind: "saved", id, editVersion: 1 })
    const product = await db.product.findUniqueOrThrow({ where: { id } })
    expect(product).toMatchObject({
      price: 1390000,
      effectivePrice: 1390000,
      editVersion: 1,
      stock: 0,
    })
    const rows = await db.auditLog.findMany({ where: { action: "updated" } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      entityId: id,
      before: { price: 1450000 },
      after: { price: 1390000 },
    })
  })

  it("E16: only the changed field is in the audit row", async () => {
    const { id } = await created()
    await updateProduct(
      actor,
      edit(id, 0, { description: "Fully modular" }),
      TODAY
    )
    const row = await db.auditLog.findFirstOrThrow({
      where: { action: "updated" },
    })
    expect(row.before).toEqual({ description: null })
    expect(row.after).toEqual({ description: "Fully modular" })
  })

  it("a spec change is audited by key", async () => {
    const { id } = await created()
    await updateProduct(
      actor,
      edit(id, 0, { specs: { ...psuSpecs, wattageW: "1200" } }),
      TODAY
    )
    const row = await db.auditLog.findFirstOrThrow({
      where: { action: "updated" },
    })
    expect(row.before).toEqual({ specs: { wattageW: 1000 } })
    expect(row.after).toEqual({ specs: { wattageW: 1200 } })
  })

  it("R19: a save with nothing changed writes, bumps and audits nothing", async () => {
    const { id } = await created()
    const before = await db.product.findUniqueOrThrow({ where: { id } })
    expect(await updateProduct(actor, edit(id, 0), TODAY)).toEqual({
      kind: "unchanged",
    })
    const after = await db.product.findUniqueOrThrow({ where: { id } })
    expect(after.editVersion).toBe(0)
    expect(after.updatedAt).toEqual(before.updatedAt)
    expect(await db.auditLog.count({ where: { action: "updated" } })).toBe(0)
  })

  it("stock is never written by a save", async () => {
    const { id } = await created()
    await db.product.update({ where: { id }, data: { stock: 7 } })
    await updateProduct(actor, edit(id, 0, { price: "9,000" }), TODAY)
    expect((await db.product.findUniqueOrThrow({ where: { id } })).stock).toBe(
      7
    )
  })

  it("E17: the second save from the same load is stale and writes nothing", async () => {
    const { id } = await created()
    expect(
      await updateProduct(actor, edit(id, 0, { name: "Name A" }), TODAY)
    ).toMatchObject({ kind: "saved" })
    const auditBefore = await db.auditLog.count()
    expect(
      await updateProduct(actor, edit(id, 0, { name: "Name B" }), TODAY)
    ).toEqual({ kind: "stale" })
    const product = await db.product.findUniqueOrThrow({ where: { id } })
    expect(product.name).toBe("Name A")
    expect(product.editVersion).toBe(1)
    expect(await db.auditLog.count()).toBe(auditBefore)
  })

  it("E17: two saves at once from the same load: one wins", async () => {
    const { id } = await created()
    const results = await Promise.all([
      updateProduct(actor, edit(id, 0, { name: "Name A" }), TODAY),
      updateProduct(actor, edit(id, 0, { name: "Name B" }), TODAY),
    ])
    expect(results.map((r) => r.kind).sort()).toEqual(["saved", "stale"])
    expect(await version(id)).toBe(1)
    expect(await db.auditLog.count({ where: { action: "updated" } })).toBe(1)
  })

  it("E18/E18b: stock and lowStockAt writes do not make a save stale", async () => {
    const { id } = await created()
    // what placing an order does to the row, and a later lowStockAt write
    await db.$executeRaw`UPDATE "Product" SET "stock" = "stock" + 3, "updatedAt" = now() WHERE "id" = ${id}`
    await db.product.update({ where: { id }, data: { lowStockAt: 9 } })
    const result = await updateProduct(
      actor,
      edit(id, 0, { price: "9,000" }),
      TODAY
    )
    expect(result).toMatchObject({ kind: "saved" })
    const product = await db.product.findUniqueOrThrow({ where: { id } })
    expect(product).toMatchObject({ stock: 3, lowStockAt: 9, price: 900000 })
  })

  it("E18a: another product save does make it stale", async () => {
    const { id } = await created()
    await updateProduct(actor, edit(id, 0, { description: "x" }), TODAY)
    expect(
      await updateProduct(actor, edit(id, 0, { price: "9,000" }), TODAY)
    ).toEqual({ kind: "stale" })
  })

  it("an unknown id is not-found", async () => {
    expect(await updateProduct(actor, edit("nope", 0), TODAY)).toEqual({
      kind: "not-found",
    })
  })

  it("E19: a SKU taken by another product is a field error; the product's own SKU is fine", async () => {
    const { id } = await created()
    await created({ sku: "OTHER", slug: "other-slug" })
    expect(
      await updateProduct(actor, edit(id, 0, { sku: "other" }), TODAY)
    ).toMatchObject({ kind: "invalid", errors: { sku: expect.any(String) } })
    expect(
      await updateProduct(actor, edit(id, 0, { name: "Renamed" }), TODAY)
    ).toMatchObject({ kind: "saved" })
  })

  it("E23: an Active product's SKU, slug and category are locked", async () => {
    const { id } = await created()
    await db.product.update({ where: { id }, data: { status: "ACTIVE" } })
    const result = await updateProduct(
      actor,
      edit(id, 0, {
        sku: "NEW-SKU",
        slug: "new-slug",
        categorySlug: "cpu",
        specs: cpuSpecs(),
      }),
      TODAY
    )
    expect(result).toMatchObject({
      kind: "invalid",
      errors: {
        sku: "Locked while the product is on sale.",
        slug: "Locked while the product is on sale.",
        categorySlug: "Locked while the product is on sale.",
      },
    })
    // but everything else can change
    expect(
      await updateProduct(actor, edit(id, 0, { price: "8,000" }), TODAY)
    ).toMatchObject({ kind: "saved" })
  })

  it("E23a: a draft can change category, with that category's specs", async () => {
    const { id } = await created()
    const result = await updateProduct(
      actor,
      edit(id, 0, { categorySlug: "motherboard", specs: boardSpecs() }),
      TODAY
    )
    expect(result).toMatchObject({ kind: "saved" })
    const product = await db.product.findUniqueOrThrow({
      where: { id },
      include: { category: true },
    })
    expect(product.category.slug).toBe("motherboard")
    expect(product.specs).toEqual(
      seedPart("motherboard", "90MB1BP0-M0AAY0").specs
    )
    const row = await db.auditLog.findFirstOrThrow({
      where: { action: "updated" },
    })
    expect(row.before).toMatchObject({ category: "psu" })
    expect(row.after).toMatchObject({ category: "motherboard" })
  })

  it("E23b: the old specs under the new category are refused and nothing changes", async () => {
    const { id } = await created()
    const result = await updateProduct(
      actor,
      edit(id, 0, { categorySlug: "motherboard" }),
      TODAY
    )
    expect(result.kind).toBe("invalid")
    if (result.kind === "invalid") {
      expect(
        Object.keys(result.errors).some((k) => k.startsWith("specs."))
      ).toBe(true)
    }
    const product = await db.product.findUniqueOrThrow({
      where: { id },
      include: { category: true },
    })
    expect(product.category.slug).toBe("psu")
    expect(product.editVersion).toBe(0)
    expect(product.specs).toMatchObject({ wattageW: 1000 })
  })

  it("E23c: an unknown category is refused", async () => {
    const { id } = await created()
    const result = await updateProduct(
      actor,
      edit(id, 0, { categorySlug: "monitors" }),
      TODAY
    )
    expect(result).toMatchObject({
      kind: "invalid",
      errors: { categorySlug: "Choose a category." },
    })
  })

  it("E14b/E14c: a passed pre-order date is only re-checked when it changes", async () => {
    const { id } = await created({ preorderShipsOn: "2026-12-01" })
    await db.product.update({
      where: { id },
      data: { preorderShipsOn: new Date("2026-10-01") },
    })
    const unchanged = await updateProduct(
      actor,
      edit(id, 0, { description: "x", preorderShipsOn: "2026-10-01" }),
      TODAY
    )
    expect(unchanged).toMatchObject({ kind: "saved" })
    const moved = await updateProduct(
      actor,
      edit(id, 1, { description: "x", preorderShipsOn: "2026-10-02" }),
      TODAY
    )
    expect(moved).toMatchObject({
      kind: "invalid",
      errors: { preorderShipsOn: "The ship date can't be in the past." },
    })
    const cleared = await updateProduct(
      actor,
      edit(id, 1, { description: "x", preorderShipsOn: "" }),
      TODAY
    )
    expect(cleared).toMatchObject({ kind: "saved" })
    expect(
      (await db.product.findUniqueOrThrow({ where: { id } })).preorderShipsOn
    ).toBeNull()
  })

  it("E31: a failing audit write rolls the update back", async () => {
    const { id } = await created()
    vi.mocked(audit.recordAudit).mockRejectedValueOnce(new Error("boom"))
    await expect(
      updateProduct(actor, edit(id, 0, { name: "Renamed" }), TODAY)
    ).rejects.toThrow("boom")
    const product = await db.product.findUniqueOrThrow({ where: { id } })
    expect(product.name).toBe("Corsair RM1000e")
    expect(product.editVersion).toBe(0)
  })

  it("E24: featured is editable", async () => {
    const { id } = await created()
    await updateProduct(actor, edit(id, 0, { featured: true }), TODAY)
    expect(
      (await db.product.findUniqueOrThrow({ where: { id } })).isFeatured
    ).toBe(true)
  })
})
