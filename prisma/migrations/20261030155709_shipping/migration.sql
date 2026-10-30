-- CreateEnum
CREATE TYPE "ShippingZone" AS ENUM ('METRO_MANILA', 'LUZON', 'VISAYAS', 'MINDANAO');

-- CreateTable
CREATE TABLE "ShippingRate" (
    "id" TEXT NOT NULL,
    "zone" "ShippingZone" NOT NULL,
    "maxWeightGrams" INTEGER,
    "fee" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "freeShippingThreshold" INTEGER,
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "storeAddress" TEXT NOT NULL,
    "storeHours" TEXT NOT NULL,
    "storeInfo" TEXT NOT NULL,
    "orderExpiryHours" INTEGER NOT NULL DEFAULT 24,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShippingRate_zone_maxWeightGrams_key" ON "ShippingRate"("zone", "maxWeightGrams");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingRate_zone_key" ON "ShippingRate"("zone") WHERE ("maxWeightGrams" IS NULL);

-- Prisma can't express CHECKs, so they live only here (docs/specs/028-
-- shipping-data-and-fee-rules, Rules › Tiers and › Store settings). db:drift
-- doesn't compare them; lib/shipping/schema.db.test.ts does.
ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_maxWeightGrams_check" CHECK ("maxWeightGrams" IS NULL OR "maxWeightGrams" > 0);
ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_fee_check" CHECK ("fee" >= 0);
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_single_row_check" CHECK ("id" = 1);
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_freeShippingThreshold_check" CHECK ("freeShippingThreshold" IS NULL OR "freeShippingThreshold" > 0);
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_orderExpiryHours_check" CHECK ("orderExpiryHours" >= 1);
