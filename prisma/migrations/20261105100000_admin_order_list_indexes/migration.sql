-- CreateIndex
CREATE INDEX "Order_createdAt_id_idx" ON "Order"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Order_status_createdAt_id_idx" ON "Order"("status", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Order_paymentOption_createdAt_id_idx" ON "Order"("paymentOption", "createdAt" DESC, "id" DESC);
