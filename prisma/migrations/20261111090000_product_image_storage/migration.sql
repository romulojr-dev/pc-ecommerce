-- Product photos (docs/specs/049-product-images-upload, #114).

-- The category placeholder is derived from the category now, never stored (D1),
-- so its rows go. Only rows under the placeholder path are deleted: a real
-- photo (a Blob or other https:// URL) is never touched. Nothing refers to a
-- ProductImage row (its only foreign key points at Product), and no order
-- item, cart line, build snapshot or email stores an image URL. The count
-- shows in the `migrate deploy` output.
DO $$
DECLARE
  removed integer;
BEGIN
  DELETE FROM "ProductImage" WHERE starts_with("url", '/images/placeholders/');
  GET DIAGNOSTICS removed = ROW_COUNT;
  RAISE NOTICE 'product_image_storage: deleted % placeholder ProductImage row(s)', removed;
END
$$;

-- DropIndex
DROP INDEX "ProductImage_productId_idx";

-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "ProductImage_productId_sortOrder_idx" ON "ProductImage"("productId", "sortOrder");

-- Prisma can't express CHECKs. Alt text is required and short (R7); the
-- display order starts at 0 (R8).
ALTER TABLE "ProductImage"
  ADD CONSTRAINT "ProductImage_alt_check" CHECK (length(btrim("alt")) BETWEEN 1 AND 200),
  ADD CONSTRAINT "ProductImage_sortOrder_check" CHECK ("sortOrder" >= 0);

-- CreateTable
CREATE TABLE "FakeStoredImage" (
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FakeStoredImage_pkey" PRIMARY KEY ("name")
);
