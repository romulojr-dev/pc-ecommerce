-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "providerRef" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_opening_key" ON "Payment"("orderId") WHERE ("status" = 'OPENING');

-- Prisma can't express CHECKs, so they live only here (docs/specs/034-
-- start-payment-outside-transaction, §6 Schema); lib/payments/schema.db.test.ts
-- covers it. An attempt has a session id exactly when it got a session of
-- ours: never while OPENING, never once FAILED.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_attempt_session_check" CHECK (("providerRef" IS NULL) = ("status" IN ('OPENING', 'FAILED')));
