-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'COD_CONFIRMED', 'PROCESSING', 'SHIPPED', 'READY_FOR_PICKUP', 'DELIVERED', 'PICKED_UP', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "Fulfillment" AS ENUM ('DELIVERY', 'PICKUP');

-- CreateEnum
CREATE TYPE "StockMovementReason" AS ENUM ('ORDER_RESERVED');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "accessTokenHash" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "cartIdHash" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "fulfillment" "Fulfillment" NOT NULL,
    "guestEmail" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactMobile" TEXT NOT NULL,
    "regionCode" TEXT,
    "regionName" TEXT,
    "provinceCode" TEXT,
    "provinceName" TEXT,
    "provinceIsGeographic" BOOLEAN NOT NULL DEFAULT false,
    "cityCode" TEXT,
    "cityName" TEXT,
    "barangayCode" TEXT,
    "barangayName" TEXT,
    "street" TEXT,
    "zip" TEXT,
    "psgcVersion" TEXT,
    "zone" "ShippingZone",
    "weightGrams" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "shippingFee" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "priceSnapshot" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "buildId" TEXT,
    "slot" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "change" INTEGER NOT NULL,
    "reason" "StockMovementReason" NOT NULL,
    "orderId" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_accessTokenHash_key" ON "Order"("accessTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_cartIdHash_idx" ON "Order"("cartIdHash");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "OrderItem_buildId_idx" ON "OrderItem"("buildId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_productId_key" ON "OrderItem"("orderId", "productId") WHERE ("buildId" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_productId_buildId_key" ON "OrderItem"("orderId", "productId", "buildId");

-- CreateIndex
CREATE INDEX "StockMovement_productId_idx" ON "StockMovement"("productId");

-- CreateIndex
CREATE INDEX "StockMovement_orderId_idx" ON "StockMovement"("orderId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma can't express CHECKs, so they live only here (docs/specs/030-place-an-
-- order). `pnpm db:drift` doesn't compare them or triggers; the integration
-- tests do.

-- Stock never goes below zero: a backstop behind the conditional update that
-- takes stock when an order is placed
ALTER TABLE "Product" ADD CONSTRAINT "Product_stock_check" CHECK ("stock" >= 0);

-- Money is whole, non-negative centavos and the total adds up
ALTER TABLE "Order" ADD CONSTRAINT "Order_amounts_check" CHECK ("subtotal" >= 0 AND "shippingFee" >= 0 AND "discount" >= 0 AND "total" >= 0 AND "weightGrams" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_total_check" CHECK ("total" = "subtotal" + "shippingFee" - "discount");

-- A delivery order has an address and a zone; a pickup order has neither.
-- provinceCode stays optional for delivery: the PSA gives independent cities
-- and the pseudo-provinces no province (docs/specs/029-checkout-steps, D14).
ALTER TABLE "Order" ADD CONSTRAINT "Order_address_check" CHECK (
  (
    "fulfillment" = 'DELIVERY'
    AND "zone" IS NOT NULL
    AND "regionCode" IS NOT NULL AND "regionName" IS NOT NULL
    AND "provinceName" IS NOT NULL
    AND "cityCode" IS NOT NULL AND "cityName" IS NOT NULL
    AND "barangayCode" IS NOT NULL AND "barangayName" IS NOT NULL
    AND "street" IS NOT NULL AND "zip" IS NOT NULL
    AND "psgcVersion" IS NOT NULL
  ) OR (
    "fulfillment" = 'PICKUP'
    AND "zone" IS NULL
    AND "regionCode" IS NULL AND "regionName" IS NULL
    AND "provinceCode" IS NULL AND "provinceName" IS NULL
    AND "provinceIsGeographic" = false
    AND "cityCode" IS NULL AND "cityName" IS NULL
    AND "barangayCode" IS NULL AND "barangayName" IS NULL
    AND "street" IS NULL AND "zip" IS NULL
    AND "psgcVersion" IS NULL
  )
);

-- An order line holds at least one unit, and a build's parts carry both the
-- build and the slot
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_quantity_check" CHECK ("quantity" >= 1);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_priceSnapshot_check" CHECK ("priceSnapshot" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_position_check" CHECK ("position" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_build_slot_check" CHECK (("buildId" IS NULL) = ("slot" IS NULL));

-- A movement changes stock by something
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_change_check" CHECK ("change" <> 0);

-- Stock writes become frequent (every order), so the search vector is no
-- longer rebuilt on every update of a product: only when a column it reads is
-- in the statement's SET list (Postgres decides by the list, not by whether
-- the value changed, so the seed, which sets them all, still recomputes).
-- "searchVector" itself stays in the list, so a value written straight to it
-- is still overwritten (ADR 0005: the app never writes it, and whatever a
-- writer sends is replaced). The brand and category triggers write it, which
-- recomputes the same value. The function is unchanged (docs/specs/014-search).
DROP TRIGGER "product_search_vector" ON "Product";
CREATE TRIGGER "product_search_vector"
BEFORE INSERT OR UPDATE OF "name", "sku", "specs", "brandId", "categoryId", "searchVector" ON "Product"
FOR EACH ROW EXECUTE FUNCTION product_set_search_vector();
