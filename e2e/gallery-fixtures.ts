import { withPool } from "./stock"

// A throwaway product with three photos for the product page's gallery E2E
// (docs/specs/010-product-page, docs/specs/049-product-images-upload). The
// seed no longer writes images, so a spec that needs several must make them.
// The "photos" are the repository's own SVG files (the category placeholder,
// box and detail views), which are real files the page can load. Inserted
// directly, with the stock helper's production guard, under a SKU prefix of
// its own (admin-images-fixtures.ts removes `E2E-IMG-` products, and the two
// specs run at the same time), and removed before and after. Not a spec.

export const SKU_PREFIX = "E2E-GAL-"

export const GALLERY_PART = {
  id: "e2egallery0000000",
  sku: `${SKU_PREFIX}ONE`,
  name: "E2E Gallery Part",
  slug: "e2e-gallery-part",
  category: "cpu",
}

export async function removeGalleryFixture() {
  await withPool(async (pool) => {
    // ProductImage rows go with their product (cascade)
    await pool.query('DELETE FROM "Product" WHERE "sku" LIKE $1', [
      `${SKU_PREFIX}%`,
    ])
  })
}

export async function insertGalleryFixture() {
  await removeGalleryFixture()
  await withPool(async (pool) => {
    const category = await pool.query<{ id: string }>(
      'SELECT "id" FROM "Category" WHERE "slug" = $1',
      [GALLERY_PART.category]
    )
    const brand = await pool.query<{ id: string }>(
      'SELECT "id" FROM "Brand" ORDER BY "slug" LIMIT 1'
    )
    if (!category.rows[0] || !brand.rows[0]) {
      throw new Error("The gallery E2E needs a seeded catalog (pnpm db:seed).")
    }
    await pool.query(
      `INSERT INTO "Product"
         ("id", "name", "slug", "sku", "price", "stock", "lowStockAt",
          "status", "specs", "weightGrams", "categoryId", "brandId",
          "updatedAt")
       VALUES ($1, $2, $3, $4, 100000, 5, 2, 'ACTIVE', '{}', 100, $5, $6,
               now())`,
      [
        GALLERY_PART.id,
        GALLERY_PART.name,
        GALLERY_PART.slug,
        GALLERY_PART.sku,
        category.rows[0].id,
        brand.rows[0].id,
      ]
    )
    const photos = [
      ["cpu", GALLERY_PART.name],
      ["box", `${GALLERY_PART.name} — in the box`],
      ["detail", `${GALLERY_PART.name} — detail view`],
    ]
    for (const [sortOrder, [file, alt]] of photos.entries()) {
      await pool.query(
        `INSERT INTO "ProductImage" ("id", "url", "alt", "sortOrder", "productId")
         VALUES ($1, $2, $3, $4, $5)`,
        [
          `e2egalleryimg${sortOrder}000`,
          `/images/placeholders/${file}.svg`,
          alt,
          sortOrder,
          GALLERY_PART.id,
        ]
      )
    }
  })
}
