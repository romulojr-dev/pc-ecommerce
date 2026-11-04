-- Cash on delivery (docs/specs/038-cash-on-delivery): the payment option and
-- confirmation time on Order, the COD settings, and the release's index over
-- both pending statuses. The settings' defaults are the demo values, which is
-- how the settings row that already exists gets them. Needs the enum value
-- added by cod_status.

-- CreateEnum
CREATE TYPE "PaymentOption" AS ENUM ('ONLINE', 'COD');

-- DropIndex
DROP INDEX "Order_expiresAt_idx";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "paymentOption" "PaymentOption" NOT NULL DEFAULT 'ONLINE';

-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "codConfirmHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "codEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "codMaxTotal" INTEGER DEFAULT 5000000,
ADD COLUMN     "codPickupEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "codZones" "ShippingZone"[] DEFAULT ARRAY['METRO_MANILA', 'LUZON']::"ShippingZone"[];

-- CreateIndex
CREATE INDEX "Order_expiresAt_idx" ON "Order"("expiresAt") WHERE (status = ANY (ARRAY['PENDING_PAYMENT'::"OrderStatus", 'PENDING_CONFIRMATION'::"OrderStatus"]));

-- Prisma can't express CHECKs, so they live only here (docs/specs/038-cash-on-
-- delivery, §6 Schema); lib/orders/cod-schema.db.test.ts covers them.

-- The two checks spec 033 added, for both pending statuses: a pending order
-- was never paid and never cancelled
ALTER TABLE "Order" DROP CONSTRAINT "Order_paidAt_check";
ALTER TABLE "Order" ADD CONSTRAINT "Order_paidAt_check" CHECK ("status" NOT IN ('PENDING_PAYMENT', 'PENDING_CONFIRMATION') OR "paidAt" IS NULL);
ALTER TABLE "Order" DROP CONSTRAINT "Order_pending_not_cancelled_check";
ALTER TABLE "Order" ADD CONSTRAINT "Order_pending_not_cancelled_check" CHECK ("status" NOT IN ('PENDING_PAYMENT', 'PENDING_CONFIRMATION') OR "cancelledAt" IS NULL);

-- An online order is Pending payment or Paid, a cash order Pending confirmation
-- or COD confirmed; the statuses after those serve both
ALTER TABLE "Order" ADD CONSTRAINT "Order_paymentOption_check" CHECK (("status" NOT IN ('PENDING_PAYMENT', 'PAID') OR "paymentOption" = 'ONLINE') AND ("status" NOT IN ('PENDING_CONFIRMATION', 'COD_CONFIRMED') OR "paymentOption" = 'COD'));

-- A cash order is paid on delivery or pickup, never before
ALTER TABLE "Order" ADD CONSTRAINT "Order_cod_paidAt_check" CHECK ("paymentOption" <> 'COD' OR "paidAt" IS NULL OR "status" IN ('DELIVERED', 'PICKED_UP', 'REFUNDED'));

-- Only a cash order has a confirmation time; not while it waits for one;
-- always once it has been confirmed and moved on (an Admin cancel keeps it)
ALTER TABLE "Order" ADD CONSTRAINT "Order_confirmedAt_check" CHECK (("confirmedAt" IS NULL OR "paymentOption" = 'COD') AND ("status" <> 'PENDING_CONFIRMATION' OR "confirmedAt" IS NULL) AND ("paymentOption" <> 'COD' OR "status" NOT IN ('COD_CONFIRMED', 'PROCESSING', 'SHIPPED', 'READY_FOR_PICKUP', 'DELIVERED', 'PICKED_UP') OR "confirmedAt" IS NOT NULL));

ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_codMaxTotal_check" CHECK ("codMaxTotal" IS NULL OR "codMaxTotal" > 0);
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_codConfirmHours_check" CHECK ("codConfirmHours" >= 1);
-- A scalar list is nullable in Postgres; an empty list is "no zone", null is a bug
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_codZones_check" CHECK ("codZones" IS NOT NULL);
