import { db } from "@/lib/db"
import { assertResetAllowed } from "@/lib/reset-guard"
import { validateSpecs } from "@/lib/specs"

// Helpers for the database integration tests (*.db.test.ts, run by
// `pnpm test:db`, docs/specs/012-common-filters)

// Last line of defence before a destructive statement: vitest.db.config.ts
// points DATABASE_URL at TEST_DATABASE_URL, so if they differ here, a test
// is about to run against another database.
function assertTestDatabase() {
  const { DATABASE_URL, TEST_DATABASE_URL } = process.env
  if (!TEST_DATABASE_URL || DATABASE_URL !== TEST_DATABASE_URL) {
    throw new Error(
      "Refusing to touch the database: it is not the integration test database. Run these tests with `pnpm test:db`."
    )
  }
}

// Empties the catalog, like `pnpm db:seed --reset`. "Build" and "Cart" are
// named too: CASCADE from "Product" empties "BuildItem" and "CartItem" but
// not their parents, which would be left pointing at nothing (docs/specs/022-
// share-build, D9; docs/specs/025-cart-single-items).
//
// The production guard runs first, as a second lock beside assertTestDatabase
// (docs/specs/022-share-build, Rules › Production safety). It doesn't need
// PRODUCTION_DATABASE_HOST: the tests only run on TEST_DATABASE_URL.
export async function resetCatalog() {
  assertResetAllowed(process.env)
  assertTestDatabase()
  await db.$executeRaw`TRUNCATE TABLE "Build", "Cart", "ProductImage", "Product", "Brand", "Category" CASCADE`
}

// One category and one brand, for tests that only need somewhere to put products
export async function createCategoryAndBrand(
  category = { name: "CPU", slug: "cpu" },
  brand = { name: "Alpha", slug: "alpha" }
) {
  const [{ id: categoryId }, { id: brandId }] = await Promise.all([
    db.category.create({ data: category, select: { id: true } }),
    db.brand.create({ data: brand, select: { id: true } }),
  ])
  return { categoryId, brandId }
}

export { db }

// "Today" for fixtures with pre-orders; tests pass it to the queries
export const FIXTURE_TODAY = "2026-10-26"

type FixtureProduct = {
  name: string
  brand: string
  category: "cpu" | "gpu"
  // Centavos
  price: number
  salePrice?: number
  stock: number
  preorderShipsOn?: string
  status?: "ACTIVE" | "DRAFT"
}

// The known catalog the filter tests run against (docs/specs/012-common-
// filters, "Fixtures"). Effective prices in pesos: P1 5,000, P2 9,000 (on
// sale from 12,000), P3 10,000, P4 20,000, P5 15,000. createdAt rises with
// the number, so "newest" is P5, P4, P3, P2, P1.
const FIXTURE_PRODUCTS: FixtureProduct[] = [
  { name: "P1", brand: "Alpha", category: "cpu", price: 500_000, stock: 10 },
  {
    name: "P2",
    brand: "Alpha",
    category: "cpu",
    price: 1_200_000,
    salePrice: 900_000,
    stock: 3, // low stock: lowStockAt is 5
  },
  {
    name: "P3",
    brand: "Beta",
    category: "cpu",
    price: 1_000_000,
    stock: 0, // out of stock
  },
  {
    name: "P4",
    brand: "Beta",
    category: "cpu",
    price: 2_000_000,
    stock: 4,
    preorderShipsOn: "2027-01-15", // pre-order
  },
  {
    name: "P5",
    brand: "Beta",
    category: "cpu",
    price: 1_500_000,
    stock: 6,
    preorderShipsOn: FIXTURE_TODAY, // ships today: the pre-order has ended
  },
  {
    name: "P6",
    brand: "Gamma",
    category: "cpu",
    price: 800_000,
    stock: 5,
    status: "DRAFT", // never listed
  },
  // Another category, to prove scoping
  { name: "G1", brand: "Delta", category: "gpu", price: 700_000, stock: 8 },
]

// Empties the catalog and inserts the fixtures; returns the category ids
export async function insertFixtures() {
  await resetCatalog()

  const categories = {
    cpu: await db.category.create({ data: { name: "CPU", slug: "cpu" } }),
    gpu: await db.category.create({ data: { name: "GPU", slug: "gpu" } }),
  }
  const brands = new Map<string, string>()
  for (const { brand } of FIXTURE_PRODUCTS) {
    if (brands.has(brand)) continue
    const { id } = await db.brand.create({
      data: { name: brand, slug: brand.toLowerCase() },
    })
    brands.set(brand, id)
  }

  for (const [index, product] of FIXTURE_PRODUCTS.entries()) {
    await db.product.create({
      data: {
        name: product.name,
        slug: product.name.toLowerCase(),
        sku: `SKU-${product.name}`,
        price: product.price,
        salePrice: product.salePrice,
        stock: product.stock,
        lowStockAt: 5,
        preorderShipsOn: product.preorderShipsOn
          ? new Date(product.preorderShipsOn)
          : null,
        status: product.status ?? "ACTIVE",
        specs: {},
        weightGrams: 100,
        createdAt: new Date(Date.UTC(2026, 9, 1 + index)),
        categoryId: categories[product.category].id,
        brandId: brands.get(product.brand)!,
      },
    })
  }

  return { cpuId: categories.cpu.id, gpuId: categories.gpu.id }
}

type SpecFixtureProduct = {
  name: string
  brand: "Alpha" | "Beta"
  category: "gpu" | "cpu-cooler" | "motherboard"
  specs: Record<string, unknown>
  stock?: number
  status?: "ACTIVE" | "DRAFT"
}

const gpu = (
  chipsetBrand: string,
  chipset: string,
  vramGb: number,
  lengthMm: number
) => ({ chipsetBrand, chipset, vramGb, lengthMm, boardPowerW: 200 })

const board = (hasWifi: boolean) => ({
  socket: "AM5",
  chipset: "B650",
  nativeCpuGenerations: ["zen-4"],
  formFactor: "ATX",
  memoryType: "DDR5",
  memorySlots: 4,
  maxMemoryGb: 128,
  m2Slots: 2,
  hasWifi,
})

// The known catalog the spec filter tests run against
// (docs/specs/013-spec-filters, "Tests"). Prices rise with the list order, so
// price-asc lists each category in this order.
const SPEC_FIXTURE_PRODUCTS: SpecFixtureProduct[] = [
  {
    name: "X1",
    brand: "Alpha",
    category: "gpu",
    specs: gpu("NVIDIA", "RTX A", 8, 240),
  },
  {
    name: "X2",
    brand: "Alpha",
    category: "gpu",
    specs: gpu("NVIDIA", "RTX B", 12, 300),
  },
  {
    name: "X3",
    brand: "Beta",
    category: "gpu",
    specs: gpu("AMD", "RX C", 16, 320),
    stock: 0,
  },
  {
    name: "X4",
    brand: "Beta",
    category: "gpu",
    specs: gpu("AMD", "RX C", 16, 340),
  },
  {
    name: "X5",
    brand: "Beta",
    category: "gpu",
    specs: gpu("NVIDIA", "RTX B", 12, 285),
    status: "DRAFT",
  },
  {
    name: "C1",
    brand: "Alpha",
    category: "cpu-cooler",
    specs: { type: "AIR", supportedSockets: ["AM4", "AM5"], heightMm: 155 },
  },
  {
    name: "C2",
    brand: "Alpha",
    category: "cpu-cooler",
    specs: { type: "AIR", supportedSockets: ["LGA1700"], heightMm: 160 },
  },
  {
    name: "C3",
    brand: "Beta",
    category: "cpu-cooler",
    specs: {
      type: "AIO",
      supportedSockets: ["AM5", "LGA1700"],
      radiatorSizeMm: 240,
    },
  },
  {
    name: "C4",
    brand: "Beta",
    category: "cpu-cooler",
    specs: { type: "AIO", supportedSockets: ["AM5"], radiatorSizeMm: 360 },
  },
  { name: "M1", brand: "Alpha", category: "motherboard", specs: board(true) },
  { name: "M2", brand: "Alpha", category: "motherboard", specs: board(false) },
]

// Empties the catalog and inserts the spec fixtures, each checked against its
// schema first; returns the categories as getCategoryProducts takes them
export async function insertSpecFixtures() {
  await resetCatalog()

  const slugs = ["gpu", "cpu-cooler", "motherboard"] as const
  const categories = Object.fromEntries(
    await Promise.all(
      slugs.map(async (slug) => {
        const { id } = await db.category.create({
          data: { name: slug, slug },
          select: { id: true },
        })
        return [slug, { id, slug }] as const
      })
    )
  ) as Record<(typeof slugs)[number], { id: string; slug: string }>

  const brands = {
    Alpha: await db.brand.create({ data: { name: "Alpha", slug: "alpha" } }),
    Beta: await db.brand.create({ data: { name: "Beta", slug: "beta" } }),
  }

  for (const [index, product] of SPEC_FIXTURE_PRODUCTS.entries()) {
    const valid = validateSpecs(product.category, product.specs)
    if (!valid.success) {
      throw new Error(`${product.name}: invalid specs: ${valid.error.message}`)
    }
    await db.product.create({
      data: {
        name: product.name,
        slug: product.name.toLowerCase(),
        sku: `SKU-${product.name}`,
        price: (index + 1) * 1_000_000,
        stock: product.stock ?? 10,
        lowStockAt: 5,
        status: product.status ?? "ACTIVE",
        specs: valid.data,
        weightGrams: 100,
        categoryId: categories[product.category].id,
        brandId: brands[product.brand].id,
      },
    })
  }

  return categories
}

// The search fixtures (docs/specs/014-search, "Tests"): real-looking parts
// whose names and SKUs are chosen for the query list, so every expected match
// is known in advance. SKUs are one letter token (FIXA...) that no query
// uses, except F1's real-shaped one. Specs hold only the string fields search
// reads, so they skip validateSpecs on purpose. Prices are made up and differ,
// for the price sorts; createdAt rises with the number.
export const SEARCH_FIXTURES = [
  {
    key: "F1",
    name: "Gigabyte GeForce RTX 5070 Windforce OC 12G",
    brand: "Gigabyte",
    sku: "GV-N5070WF3OC-12GD",
    category: "gpu",
    specs: { chipsetBrand: "NVIDIA", chipset: "GeForce RTX 5070" },
    price: 5_000_000,
  },
  {
    key: "F2",
    name: "MSI GeForce RTX 5070 Ti Ventus 16G",
    brand: "MSI",
    sku: "FIXB",
    category: "gpu",
    specs: { chipsetBrand: "NVIDIA", chipset: "GeForce RTX 5070 Ti" },
    price: 4_500_000,
  },
  {
    key: "F3",
    name: "ASUS Dual GeForce RTX 4060 OC 8GB",
    brand: "ASUS",
    sku: "FIXC",
    category: "gpu",
    specs: { chipsetBrand: "NVIDIA", chipset: "GeForce RTX 4060" },
    price: 1_800_000,
  },
  {
    key: "F4",
    name: "AMD Ryzen 7 7800X3D",
    brand: "AMD",
    sku: "FIXD",
    category: "cpu",
    specs: { socket: "AM5", generation: "zen-4" },
    price: 2_300_000,
  },
  {
    key: "F5",
    name: "AMD Ryzen 7 9800X3D",
    brand: "AMD",
    sku: "FIXE",
    category: "cpu",
    specs: { socket: "AM5", generation: "zen-5" },
    price: 2_900_000,
  },
  {
    key: "F6",
    name: "AMD Ryzen 5 7600",
    brand: "AMD",
    sku: "FIXF",
    category: "cpu",
    specs: { socket: "AM5", generation: "zen-4" },
    price: 1_100_000,
  },
  {
    key: "F7",
    name: "Intel Core i5-14400F",
    brand: "Intel",
    sku: "FIXG",
    category: "cpu",
    specs: { socket: "LGA1700", generation: "raptor-lake-refresh" },
    price: 1_000_000,
  },
  {
    key: "F8",
    name: "ASUS ROG Strix B650-A Gaming WiFi",
    brand: "ASUS",
    sku: "FIXH",
    category: "motherboard",
    specs: {
      socket: "AM5",
      chipset: "B650",
      memoryType: "DDR5",
      formFactor: "ATX",
    },
    price: 1_500_000,
  },
  {
    key: "F9",
    name: "ASRock B650I Lightning WiFi",
    brand: "ASRock",
    sku: "FIXI",
    category: "motherboard",
    specs: {
      socket: "AM5",
      chipset: "B650",
      memoryType: "DDR5",
      formFactor: "MINI_ITX",
    },
    price: 1_400_000,
  },
  {
    key: "F10",
    name: "MSI PRO B760M-A WiFi DDR4",
    brand: "MSI",
    sku: "FIXJ",
    category: "motherboard",
    specs: {
      socket: "LGA1700",
      chipset: "B760",
      memoryType: "DDR4",
      formFactor: "MICRO_ATX",
    },
    price: 900_000,
  },
  {
    key: "F11",
    name: "Kingston FURY Beast DDR5-5600 16 GB (1×16 GB) CL40",
    brand: "Kingston",
    sku: "FIXK",
    category: "memory",
    specs: { memoryType: "DDR5" },
    price: 300_000,
  },
  {
    key: "F12",
    name: "Kingston FURY Beast DDR4-3200 16 GB (2×8 GB) CL16",
    brand: "Kingston",
    sku: "FIXL",
    category: "memory",
    specs: { memoryType: "DDR4" },
    price: 250_000,
  },
  {
    key: "F13",
    name: "Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30",
    brand: "Corsair",
    sku: "FIXM",
    category: "memory",
    specs: { memoryType: "DDR5" },
    price: 650_000,
  },
  {
    key: "F14",
    name: "Gigabyte GeForce RTX 5070 Windforce OC 12G",
    brand: "Gigabyte",
    sku: "FIXN",
    category: "gpu",
    specs: { chipsetBrand: "NVIDIA", chipset: "GeForce RTX 5070" },
    price: 5_000_000,
    status: "DRAFT", // never found
  },
] as const satisfies readonly {
  key: string
  name: string
  brand: string
  sku: string
  category: "gpu" | "cpu" | "motherboard" | "memory"
  specs: object
  price: number
  status?: "DRAFT"
}[]

export type SearchFixtureKey = (typeof SEARCH_FIXTURES)[number]["key"]

const SEARCH_CATEGORIES = {
  gpu: "Graphics Card",
  cpu: "CPU",
  motherboard: "Motherboard",
  memory: "Memory",
}

// Empties the catalog and inserts the search fixtures; returns the fixture
// key of each product id, to read results back as F1, F2...
export async function insertSearchFixtures(): Promise<
  Map<string, SearchFixtureKey>
> {
  await resetCatalog()

  const categories = new Map<string, string>()
  for (const [slug, name] of Object.entries(SEARCH_CATEGORIES)) {
    const { id } = await db.category.create({ data: { name, slug } })
    categories.set(slug, id)
  }
  const brands = new Map<string, string>()
  for (const { brand } of SEARCH_FIXTURES) {
    if (brands.has(brand)) continue
    const { id } = await db.brand.create({
      data: { name: brand, slug: brand.toLowerCase() },
    })
    brands.set(brand, id)
  }

  const keys = new Map<string, SearchFixtureKey>()
  for (const [index, product] of SEARCH_FIXTURES.entries()) {
    const { id } = await db.product.create({
      data: {
        name: product.name,
        slug: product.key.toLowerCase(),
        sku: product.sku,
        price: product.price,
        stock: 10,
        status: "status" in product ? product.status : "ACTIVE",
        specs: product.specs,
        weightGrams: 100,
        createdAt: new Date(Date.UTC(2026, 9, 1 + index)),
        categoryId: categories.get(product.category)!,
        brandId: brands.get(product.brand)!,
      },
      select: { id: true },
    })
    keys.set(id, product.key)
  }
  return keys
}
