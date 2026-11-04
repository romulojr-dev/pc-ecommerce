-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('FIXED', 'PERCENT');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "voucherCode" TEXT,
ADD COLUMN     "voucherId" TEXT;

-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "VoucherType" NOT NULL,
    "value" INTEGER NOT NULL,
    "minSpend" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_code_key" ON "Voucher"("code");

-- CreateIndex
CREATE INDEX "Order_voucherId_idx" ON "Order"("voucherId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Prisma can't express CHECKs, so they live only here (docs/specs/037-vouchers-
-- at-checkout, §6 Schema); lib/vouchers/schema.db.test.ts covers them.
-- The code is stored upper-case, 3 to 32 of A-Z 0-9 _ -
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_code_check" CHECK ("code" ~ '^[A-Z0-9_-]{3,32}$');
-- A percent is 1 to 100, a fixed amount is above 0; a minimum spend is not negative
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_value_check" CHECK (("type" = 'PERCENT' AND "value" BETWEEN 1 AND 100) OR ("type" = 'FIXED' AND "value" > 0));
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_minSpend_check" CHECK ("minSpend" >= 0);
-- Unlimited is null; a limit of at least 1; the count stays within it
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_usage_check" CHECK (("usageLimit" IS NULL OR "usageLimit" >= 1) AND "usedCount" >= 0 AND ("usageLimit" IS NULL OR "usedCount" <= "usageLimit"));
-- It ends after it starts
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_dates_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");

-- An order's discount never passes its subtotal; the code and the id go
-- together; a discount comes from a voucher
ALTER TABLE "Order" ADD CONSTRAINT "Order_discount_check" CHECK ("discount" <= "subtotal");
ALTER TABLE "Order" ADD CONSTRAINT "Order_voucher_check" CHECK (("voucherId" IS NULL) = ("voucherCode" IS NULL) AND ("discount" = 0 OR "voucherId" IS NOT NULL));
