-- Order fulfillment (docs/specs/043-order-fulfillment-transitions): the time of
-- each staff move, the courier and tracking number, and the three emails.

-- AlterEnum (the values are not used in this file)
ALTER TYPE "EmailType" ADD VALUE 'ORDER_SHIPPED';
ALTER TYPE "EmailType" ADD VALUE 'ORDER_DELIVERED';
ALTER TYPE "EmailType" ADD VALUE 'READY_FOR_PICKUP';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "processingAt" TIMESTAMP(3),
ADD COLUMN     "shippedAt" TIMESTAMP(3),
ADD COLUMN     "readyAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "courier" TEXT,
ADD COLUMN     "trackingNumber" TEXT;

-- CHECKs Prisma can't express. None names REFUNDED or CANCELLED, so a delivered
-- order that is later refunded still satisfies them (spec 043, R6, D11).
ALTER TABLE "Order" ADD CONSTRAINT "Order_shipped_details_check" CHECK ("shippedAt" IS NULL OR ("courier" IS NOT NULL AND "trackingNumber" IS NOT NULL));
ALTER TABLE "Order" ADD CONSTRAINT "Order_shipped_status_check" CHECK ("status" NOT IN ('SHIPPED', 'DELIVERED') OR "shippedAt" IS NOT NULL);
ALTER TABLE "Order" ADD CONSTRAINT "Order_completed_status_check" CHECK ("status" NOT IN ('DELIVERED', 'PICKED_UP') OR "completedAt" IS NOT NULL);
