-- CreateEnum
CREATE TYPE "OrderCancelReason" AS ENUM ('EXPIRED');

-- AlterEnum
ALTER TYPE "StockMovementReason" ADD VALUE 'ORDER_RELEASED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelReason" "OrderCancelReason",
ADD COLUMN     "cancelledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_expiresAt_idx" ON "Order"("expiresAt") WHERE ("status" = 'PENDING_PAYMENT');

-- Prisma can't express CHECKs, so they live only here (docs/specs/033-
-- release-unpaid-orders, §6 Schema); lib/orders/schema.db.test.ts covers them
ALTER TABLE "Order" ADD CONSTRAINT "Order_cancelled_check" CHECK ("status" <> 'CANCELLED' OR ("cancelledAt" IS NOT NULL AND "cancelReason" IS NOT NULL));
ALTER TABLE "Order" ADD CONSTRAINT "Order_pending_not_cancelled_check" CHECK ("status" <> 'PENDING_PAYMENT' OR "cancelledAt" IS NULL);
