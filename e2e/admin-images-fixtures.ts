import sharp from "sharp"

import { withPool } from "./stock"

// Throwaway products and picture files for e2e/admin-images.spec.ts
// (docs/specs/049-product-images-upload). Inserted directly, in the database
// the app server uses, with the stock helper's production guard, under a SKU
// prefix, and removed (with their photos and the fake store's files) before
// and after. Audit rows stay: the log refuses deletes by design. Not a spec
// itself.

export const SKU_PREFIX = "E2E-IMG-"

export type ImageFixture = {
  id: string
  sku: string
  name: string
  slug: string
}

// The id looks like a cuid (lowercase letters and digits only), which is all
// the upload route and the photo actions accept
const make = (key: string, name: string): ImageFixture => ({
  id: `e2eimg${key}0000000`,
  sku: `${SKU_PREFIX}${key.toUpperCase()}`,
  name,
  slug: `e2e-img-${key}`,
})

export const ALPHA = make("alpha", "E2E Photos Alpha")
export const BETA = make("beta", "E2E Photos Beta")

export async function removeImageFixtures() {
  await withPool(async (pool) => {
    // The fake store's files go with the rows that name them
    await pool.query(
      `DELETE FROM "FakeStoredImage" WHERE '/test-images/' || "name" IN
         (SELECT "url" FROM "ProductImage" WHERE "productId" IN
            (SELECT "id" FROM "Product" WHERE "sku" LIKE $1))`,
      [`${SKU_PREFIX}%`]
    )
    // ProductImage rows go with their product (cascade)
    await pool.query('DELETE FROM "Product" WHERE "sku" LIKE $1', [
      `${SKU_PREFIX}%`,
    ])
  })
}

// Returns the slug of the category the products are in, for the store URL
export async function insertImageFixtures(): Promise<string> {
  await removeImageFixtures()
  return withPool(async (pool) => {
    const category = await pool.query<{ id: string; slug: string }>(
      `SELECT "id", "slug" FROM "Category" WHERE "slug" = 'cpu'`
    )
    const brand = await pool.query<{ id: string }>(
      'SELECT "id" FROM "Brand" ORDER BY "slug" LIMIT 1'
    )
    if (!category.rows[0] || !brand.rows[0]) {
      throw new Error(
        "The photos E2E needs a seeded catalog (pnpm db:seed) with a cpu category."
      )
    }
    for (const fixture of [ALPHA, BETA]) {
      await pool.query(
        `INSERT INTO "Product"
           ("id", "name", "slug", "sku", "price", "stock", "lowStockAt",
            "status", "specs", "weightGrams", "categoryId", "brandId",
            "updatedAt")
         VALUES ($1, $2, $3, $4, 100000, 5, 2, 'ACTIVE', '{}', 100,
                 $5, $6, now() + interval '1 day')`,
        [
          fixture.id,
          fixture.name,
          fixture.slug,
          fixture.sku,
          category.rows[0].id,
          brand.rows[0].id,
        ]
      )
    }
    return category.rows[0].slug
  })
}

export const storeUrl = (categorySlug: string, fixture: ImageFixture) =>
  `/${categorySlug}/${fixture.slug}`

// Two different pictures, so the order on the page is visible in the bytes
export async function picture(color: string, name: string) {
  return {
    name,
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 240, height: 180, channels: 3, background: color },
    })
      .png()
      .toBuffer(),
  }
}

export async function imageRows(productId: string) {
  return withPool(async (pool) => {
    const { rows } = await pool.query<{
      id: string
      url: string
      alt: string
      sortOrder: number
    }>(
      `SELECT "id", "url", "alt", "sortOrder" FROM "ProductImage"
       WHERE "productId" = $1 ORDER BY "sortOrder"`,
      [productId]
    )
    return rows
  })
}
