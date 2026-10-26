-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "effectivePrice" INTEGER NOT NULL DEFAULT 0;

-- Backfill: what the shopper pays today
UPDATE "Product" SET "effectivePrice" = COALESCE("salePrice", "price");

-- Keep it right for every writer (the app, the seed, the Neon console). Prisma
-- doesn't model triggers, so it neither diffs nor drops this one. The app
-- never writes the column; whatever it sends is overwritten here.
-- docs/specs/012-common-filters
CREATE FUNCTION product_set_effective_price() RETURNS trigger AS $$
BEGIN
  NEW."effectivePrice" := COALESCE(NEW."salePrice", NEW."price");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_effective_price
BEFORE INSERT OR UPDATE ON "Product"
FOR EACH ROW EXECUTE FUNCTION product_set_effective_price();
