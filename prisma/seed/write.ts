import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import { toDbZone } from "@/lib/shipping/zone-enum"
import { builderCategories } from "@/lib/specs"

import type { ShippingSeed } from "./data/shipping"
import type { VoucherSeed } from "./data/vouchers"
import type { ValidPart, ValidSeedFile } from "./validate"

// The seed only CREATES (docs/specs/045-admin-products-create-edit, D8): a
// product, category or brand that already exists is left exactly as it is, so
// re-seeding production never undoes an edit made in Admin. The one exception
// is images, added to a product that has none until Admin manages them (#114).

export type SeedCounts = {
  categories: number
  brands: number
  created: number
  // Products that already existed and were left as they are
  existing: number
  // ProductImage rows added
  images: number
  // ShippingRate rows added (0 when the table already had rows)
  shippingRates: number
  // Whether the StoreSettings row was created (false when it already existed)
  settingsCreated: boolean
  // Voucher rows added (a code that already exists is left as it is)
  vouchers: number
}

export class SeedWriteError extends Error {}

// Writes the validated seed in one transaction: on any failure, nothing is
// written (and a --reset truncate is rolled back too).
export function writeSeed(
  db: PrismaClient,
  files: ValidSeedFile[],
  {
    reset,
    shipping,
    vouchers = [],
  }: { reset: boolean; shipping: ShippingSeed; vouchers?: VoucherSeed[] }
): Promise<SeedCounts> {
  return db.$transaction(
    async (tx) => {
      if (reset) {
        // CASCADE also empties tables that reference products (BuildItem,
        // CartItem, and orders, … in later stories): a clean slate. "Build"
        // and "Cart" are named too: nothing in them points at a product, so
        // CASCADE from "Product" would leave them behind with no items
        // (docs/specs/022-share-build, D9; docs/specs/025-cart-single-items).
        // Add each new table of that kind here. "ShippingRate" and
        // "StoreSettings" point at no product either; they are named so a
        // reset clears the demo shipping values for the seed to refill
        // (docs/specs/028-shipping-data-and-fee-rules). "Order" is named too:
        // CASCADE from "Product" empties "OrderItem" and "StockMovement" but
        // not their parent order (docs/specs/030-place-an-order). "Payment"
        // and "FakeGatewaySession" are named for the reader: the first goes
        // with "Order" anyway, the second points at nothing
        // (docs/specs/031-pay-with-xendit), and so is "PaymentEvent"
        // (docs/specs/032-payment-webhooks). "EmailOutbox" goes with "Order"
        // and "FakeEmail" points at nothing; both are named for the reader
        // (docs/specs/035-email-foundation-signed-links). "Voucher" points at no
        // product and is not emptied by "Order" either (Order points at it), so
        // it is named (docs/specs/037-vouchers-at-checkout). "AuditLog" points
        // at a staff User, not a product: it is named so a reset clears the
        // history of changes to the catalog it just emptied; User, Session and
        // Account rows are never truncated (docs/specs/040-admin-permissions-
        // audit-masking).
        await tx.$executeRaw`TRUNCATE TABLE "Build", "Cart", "Order", "StockMovement", "AuditLog", "Payment", "PaymentEvent", "FakeGatewaySession", "EmailOutbox", "FakeEmail", "Voucher", "ShippingRate", "StoreSettings", "ProductImage", "Product", "Brand", "Category" CASCADE`
      }

      const categoryIds = await upsertCategories(tx)
      const parts = files.flatMap(({ category, parts }) =>
        parts.map((part) => ({ part, categoryId: categoryIds.get(category)! }))
      )
      const brandIds = await upsertBrands(
        tx,
        parts.map(({ part }) => part)
      )

      // Existing products by SKU, with how many images each has
      const existing = new Map(
        (
          await tx.product.findMany({
            where: { sku: { in: parts.map(({ part }) => part.sku) } },
            select: { sku: true, _count: { select: { images: true } } },
          })
        ).map(({ sku, _count }) => [sku, _count.images])
      )
      const newParts = parts.filter(({ part }) => !existing.has(part.sku))
      await checkSlugConflicts(
        tx,
        newParts.map(({ part }) => part)
      )

      let imagesAdded = 0
      for (const { part, categoryId } of parts) {
        const data = productData(
          part,
          categoryId,
          brandIds.get(part.brandSlug)!
        )
        // Images are added only to a product that has none: once the admin
        // panel manages a product's images, a re-seed leaves them alone
        const images = {
          create: part.images.map((image, index) => ({
            ...image,
            sortOrder: index,
          })),
        }
        const imageCount = existing.get(part.sku)
        if (imageCount === undefined) {
          await tx.product.create({ data: { ...data, images } })
          imagesAdded += part.images.length
        } else if (imageCount === 0) {
          await tx.product.update({
            where: { sku: part.sku },
            data: { images },
          })
          imagesAdded += part.images.length
        }
      }

      const shippingWritten = await writeShipping(tx, shipping)
      const vouchersAdded = await writeVouchers(tx, vouchers)

      return {
        categories: categoryIds.size,
        brands: brandIds.size,
        created: newParts.length,
        existing: parts.length - newParts.length,
        images: imagesAdded,
        ...shippingWritten,
        vouchers: vouchersAdded,
      }
    },
    // Prisma's default is 5 s; ~150 sequential writes to a remote database
    // can take longer (60 parts took under 30 s against Neon, so 150 may
    // take about 75 s)
    { maxWait: 10_000, timeout: 180_000 }
  )
}

// The store settings row only when it is missing, and the rates only when the
// table is empty, so a re-seed never overwrites what Admin has set (D10)
async function writeShipping(
  tx: Prisma.TransactionClient,
  shipping: ShippingSeed
) {
  const settings = await tx.storeSettings.createMany({
    data: [
      {
        id: 1,
        ...shipping.store,
        codZones: shipping.store.codZones.map((zone) => toDbZone[zone]),
      },
    ],
    skipDuplicates: true,
  })
  let shippingRates = 0
  if ((await tx.shippingRate.count()) === 0) {
    const created = await tx.shippingRate.createMany({
      data: shipping.rates.map((rate) => ({
        zone: toDbZone[rate.zone],
        maxWeightGrams: rate.maxWeightGrams,
        fee: rate.fee,
      })),
    })
    shippingRates = created.count
  }
  return { shippingRates, settingsCreated: settings.count === 1 }
}

// Each demo code only when its code is missing: ON CONFLICT DO NOTHING, so an
// edited row, and its usedCount, are never touched (docs/specs/037-vouchers-
// at-checkout, D11). Returns how many were added.
async function writeVouchers(
  tx: Prisma.TransactionClient,
  vouchers: VoucherSeed[]
) {
  if (vouchers.length === 0) return 0
  const created = await tx.voucher.createMany({
    data: vouchers.map((voucher) => ({
      ...voucher,
      startsAt: new Date(voucher.startsAt),
      endsAt: voucher.endsAt ? new Date(voucher.endsAt) : null,
    })),
    skipDuplicates: true,
  })
  return created.count
}

// Category rows come from the registry, so names and order match the code
// for a new row. An existing row is left as it is (Admin edits categories).
async function upsertCategories(tx: Prisma.TransactionClient) {
  const entries = Object.entries(builderCategories)
  await tx.category.createMany({
    data: entries.map(([slug, { name, sortOrder }]) => ({
      slug,
      name,
      sortOrder,
    })),
    skipDuplicates: true,
  })
  const rows = await tx.category.findMany({
    where: { slug: { in: entries.map(([slug]) => slug) } },
    select: { id: true, slug: true },
  })
  return new Map(rows.map(({ slug, id }) => [slug, id]))
}

// One brand per slug; the first spelling in the data names a new one. An
// existing brand is left as it is.
async function upsertBrands(tx: Prisma.TransactionClient, parts: ValidPart[]) {
  const names = new Map<string, string>()
  for (const { brandSlug, brand } of parts) {
    if (!names.has(brandSlug)) names.set(brandSlug, brand)
  }
  await tx.brand.createMany({
    data: [...names].map(([slug, name]) => ({ slug, name })),
    skipDuplicates: true,
  })
  const rows = await tx.brand.findMany({
    where: { slug: { in: [...names.keys()] } },
    select: { id: true, slug: true },
  })
  return new Map(rows.map(({ slug, id }) => [slug, id]))
}

// A new part's slug may already belong to a product that isn't in the seed
// (e.g. one created in the admin panel). Fail with both SKUs instead of a
// raw unique-constraint error.
async function checkSlugConflicts(
  tx: Prisma.TransactionClient,
  newParts: ValidPart[]
) {
  const taken = await tx.product.findMany({
    where: { slug: { in: newParts.map((part) => part.slug) } },
    select: { slug: true, sku: true },
  })
  if (taken.length === 0) return
  const lines = taken.map(({ slug, sku }) => {
    const part = newParts.find((p) => p.slug === slug)!
    return `  slug "${slug}" for sku ${part.sku} is already used by sku ${sku}`
  })
  throw new SeedWriteError(
    ["Seed failed: slug conflicts. Nothing was written.", ...lines].join("\n")
  )
}

function productData(part: ValidPart, categoryId: string, brandId: string) {
  return {
    sku: part.sku,
    slug: part.slug,
    name: part.name,
    // null (not undefined) so removing a description from the data clears it
    description: part.description ?? null,
    price: part.price,
    salePrice: part.salePrice ?? null,
    stock: part.stock,
    lowStockAt: part.lowStockAt,
    specs: part.specs as Prisma.InputJsonValue,
    weightGrams: part.weightGrams,
    warrantyMonths: part.warrantyMonths,
    boxContents: part.boxContents ?? [],
    // "2027-01-15" parses as UTC midnight, which a date column stores as
    // that day
    preorderShipsOn: part.preorderShipsOn
      ? new Date(part.preorderShipsOn)
      : null,
    status: part.status,
    isFeatured: part.featured ?? false,
    categoryId,
    brandId,
  } satisfies Prisma.ProductUncheckedCreateInput
}
