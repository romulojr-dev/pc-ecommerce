-- The dashboard sales window (docs/specs/048-admin-dashboard, D14): orders by
-- when they were paid. Partial, so unpaid orders are not in it. Index only:
-- no data, trigger or constraint changes.

-- CreateIndex
CREATE INDEX "Order_paidAt_idx" ON "Order"("paidAt") WHERE ("paidAt" IS NOT NULL);
