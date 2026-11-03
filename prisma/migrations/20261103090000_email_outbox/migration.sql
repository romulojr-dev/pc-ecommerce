-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('ORDER_PLACED', 'PAYMENT_RECEIVED', 'ORDER_CANCELLED', 'COD_CONFIRM');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "EmailType" NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "recipientHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FakeEmail" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FakeEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailOutbox_recipientHash_sentAt_idx" ON "EmailOutbox"("recipientHash", "sentAt");

-- CreateIndex
CREATE INDEX "EmailOutbox_status_claimedAt_idx" ON "EmailOutbox"("status", "claimedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailOutbox_orderId_type_key" ON "EmailOutbox"("orderId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "FakeEmail_idempotencyKey_key" ON "FakeEmail"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma can't express CHECKs, so they live only here (docs/specs/035-email-
-- foundation-signed-links, §6 Schema); lib/email/schema.db.test.ts covers them.
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_attempts_check" CHECK ("attempts" >= 0);
-- A sent row has its time and message id, and only a sent row does
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_sent_check" CHECK (("sentAt" IS NOT NULL) = ("status" = 'SENT') AND ("providerMessageId" IS NOT NULL) = ("status" = 'SENT'));
-- A sending row has the time of its claim, which the lease is judged from
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_sending_check" CHECK ("status" <> 'SENDING' OR "claimedAt" IS NOT NULL);
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_hash_check" CHECK ("recipientHash" ~ '^[0-9a-f]{64}$');
