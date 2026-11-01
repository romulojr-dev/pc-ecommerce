-- CreateEnum
CREATE TYPE "PaymentProblem" AS ENUM ('AMOUNT_MISMATCH', 'LATE', 'SECOND_PAYMENT');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "refundRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "gatewayPaymentId" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "problem" "PaymentProblem",
ADD COLUMN     "receivedAmount" INTEGER,
ADD COLUMN     "receivedCurrency" TEXT;

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "paymentId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_eventId_key" ON "PaymentEvent"("eventId");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentId_idx" ON "PaymentEvent"("paymentId");

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma can't express CHECKs, so they live only here (docs/specs/032-
-- payment-webhooks, §6 Schema); lib/payments/schema.db.test.ts covers them
ALTER TABLE "Order" ADD CONSTRAINT "Order_paidAt_check" CHECK ("status" <> 'PENDING_PAYMENT' OR "paidAt" IS NULL);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paid_check" CHECK (("status" = 'PAID') = ("paidAt" IS NOT NULL));
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivedAmount_check" CHECK ("receivedAmount" IS NULL OR "receivedAmount" > 0);
